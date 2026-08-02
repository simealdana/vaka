# VAKA — Simulador de escenarios para finca ganadera doble propósito

## Contexto

`intruction.md` especifica un motor de escenarios, sensibilidad y estrés para una operación
ganadera de leche. El requisito central no es mostrar un resultado final, sino explicar la
**cadena causal completa**: variable modificada → impacto operativo → impacto financiero →
impacto patrimonial → decisiones necesarias.

Hoy el repositorio solo contiene ese documento. Construimos el MVP desde cero en Next.js.

Dos exigencias del documento condicionan toda la arquitectura:

1. **Efectos diferidos** (líneas 58-70): si sube la mortalidad de becerras hoy, las vacas en
   ordeño caen dentro de 24-36 meses. Un modelo de hato agregado no puede producir esto.
2. **Superaditividad** (línea 212): el escenario combinado debe mostrar el efecto conjunto,
   "no simplemente sumar impactos independientes". Requiere bucles de retroalimentación reales
   entre nutrición, producción, fertilidad y mortalidad.

Ambas fuerzan un modelo de cohortes por edad con estado biológico, no una hoja de cálculo.

### Decisiones acordadas

| Decisión | Elección |
|---|---|
| Alcance | Completo: individual, combinado, temporal, estrés, Monte Carlo, sensibilidad |
| Escenario base | Doble propósito tropical (Venezuela): mestizo cebú, becerro al pie, 8-12 L/vaca/día, estacionalidad seca marcada |
| Canales de leche | Mix industria / venta directa / queso, con precio, merma y costo de proceso por canal |
| Explicaciones | Híbrido: plantillas deterministas siempre + botón opcional "explicar con IA" |
| Persistencia | localStorage + IndexedDB, sin backend ni auth, más import/export JSON |
| Tests | Vitest solo sobre el motor de cálculo |

---

## Stack

Next.js 15 (App Router) · TypeScript estricto · Tailwind + shadcn/ui · Zustand + immer ·
Recharts (wrapper `chart.tsx` de shadcn) · Vitest · Web Worker · Vercel.

Único endpoint de servidor: `app/api/explicar/route.ts`. Todo lo demás corre en el cliente.

---

## Arquitectura

### Motor (`src/engine/`) — TypeScript puro, determinista, sin React ni I/O

```
src/engine/
  types/        assumptions.ts  herd.ts  results.ts  overrides.ts
  herd/         cohorts.ts  transitions.ts  reproduction.ts  mortality.ts  culling.ts  growth.ts
  production/   lactation.ts  milk.ts  channels.ts
  nutrition/    demand.ts  supply.ts  balance.ts  response.ts
  finance/      revenue.ts  costs.ts  cashflow.ts  debt.ts  depreciation.ts
                valuation.ts  metrics.ts
  scenario/     overrides.ts  resolve.ts  presets.ts
  analysis/     montecarlo.ts  sensitivity.ts  breakpoint.ts  rng.ts
  tick.ts       # stepMonth(state, params) -> MonthlyResult, función pura
  simulate.ts   # API pública: simulate(assumptions, overrides) -> SimulationOutput
```

**Representación del hato** (horizonte 120 meses):

- Hembras jóvenes: `Float64Array(45)` indexada por edad en meses + `Float64Array(10)` de novillas
  por mes de gestación. Las categorías (becerra, destetada, levante, preñada) son **derivadas**
  del índice, no estados separados.
- Machos: `Float64Array(30)` por edad.
- Vacas adultas: mapa esparso con clave `dim*300 + gest*30 + parityBucket` (≤540 estados,
  típicamente <120 vivos). Claves idénticas se fusionan cada tick.
- Conteos **fraccionarios**, no enteros: determinismo total. Se redondea solo al presentar.

Esta estructura (malla etaria tipo Leslie) reproduce el rezago de 24-36 meses **por construcción**:
matar 10% de becerras en el mes 3 vacía ese índice, y el hueco viaja mecánicamente hasta el parto
en el mes ~27. Coste: ~600 números por tick.

**Bucles de retroalimentación** (lo que hace superaditivo al escenario combinado):

```
NBR = clamp(ofertaMS / demandaMS, 0.4, 1.3)          // balance nutricional del mes
bcs[t+1] = clamp(bcs[t] + 0.3 * (NBR - 1), 1, 5)     // único integrador del sistema
```

- La **leche** responde a NBR (rápido, mismo mes, elasticidad ~0.6, piso 0.5).
- **Fertilidad y mortalidad** responden a BCS (lento), nunca a NBR directo.
- Sin circularidad intra-tick: NBR usa el hato a inicio de mes y `bcs[t-1]`; BCS se actualiza al final.
- Todas las respuestas son **tablas monótonas acotadas** con interpolación lineal, editables y
  visibles en la UI (5-6 puntos cada una) — nada de exponenciales ocultas.

Esta separación de escalas temporales es deliberada: evita las oscilaciones de alta frecuencia que
harían el modelo inestable e imposible de calibrar.

**Orden del tick mensual** (la biología del mes `t` lee el estado a inicio de mes; solo el paso 14
muta hacia `t+1`, lo que hace el tick invariante al orden interno de los pasos 6-13):

1. Leer parámetros resueltos del mes · 2. Inventario · 3. Demanda MS · 4. Oferta MS ·
5. NBR y multiplicadores · 6. Producción de leche por cohorte · 7. Eventos sanitarios ·
8. Servicios y concepciones · 9. Abortos · 10. Partos · 11. Secado · 12. Mortalidad ·
13. Descarte y ventas · 14. Envejecer cohortes y actualizar BCS · 15. Finanzas · 16. Valuación.

**Interfaces centrales** (`src/engine/types/`):

```ts
type ParamPath = string;  // "milk.pricePerLiter", "health.calfMortalityAnnual"

interface Assumptions {
  horizonMonths: 120; seed: number;
  herd; repro; milk; channels; health; feed; costs; capital; prices; macro; policy;
}

interface ScenarioOverride {
  id; label; target: ParamPath;
  op: 'multiply' | 'set' | 'add' | 'pctDelta';
  value: number;
  startMonth: number; durationMonths: number;        // Infinity = permanente
  rampInMonths?: number;
  recovery?: { type: 'none'|'immediate'|'linear'|'exponential'; months: number };
  repeat?: { everyMonths: number; times: number };
  priority?: number;
}

interface MonthlyResult { month; herd; repro; milk; feed; pnl; cash; balance; flags }
interface SimulationOutput { months: MonthlyResult[]; summary; warnings }
```

`scenario/resolve.ts` precompila los overrides en `Float64Array` por `ParamPath` **antes** del
bucle → el tick solo hace `timeline.get(path, t)` en O(1), sin lógica de eventos en el hot path.
Composición: `multiply`/`pctDelta` por producto, `set` gana el de mayor prioridad, `add` al final.

**Doble patrimonio** (el documento los distingue explícitamente, línea 366):

- *Contable*: hato a costo de crianza acumulado + activos fijos netos + caja − deuda.
- *Realizable*: hato a precio de mercado × (1 − haircut de venta forzada) + salvamento + tierra − deuda.

La brecha entre ambos es métrica de primera clase, no un detalle.

**Rendimiento**: una corrida de 120 meses son 0.3-1.5 ms con buffers preasignados y cero
alocación en el bucle (el enemigo es el GC, no la aritmética). 5.000 iteraciones Monte Carlo:
2-7 s en un hilo → Web Worker obligatorio, con `collect:'summaryOnly'`. PRNG sembrado
(mulberry32) con `seed_i = hash(baseSeed, i)` → reproducibilidad exacta y capacidad de
"reproducir el peor escenario". Distribuciones triangulares por defecto (min/moda/max es lo que
un ganadero sabe especificar), lognormal para precios, correlación por cópula gaussiana sobre
4-6 factores — sin correlación el P10 sale artificialmente optimista.

### Aplicación (`app/`, `components/`, `lib/`)

Cinco pantallas. El simulador es el centro; el resto consume el mismo escenario activo.

```
app/
  layout.tsx            # topbar: escenario activo, guardar, export/import, estado de cálculo
  page.tsx              # SIMULADOR
  estres/page.tsx       # 8 pruebas preconfiguradas
  riesgo/page.tsx       # Monte Carlo + tornado de sensibilidad
  comparar/page.tsx     # matriz de escenarios × 15 métricas
  preguntas/page.tsx    # las 15 preguntas del documento, resueltas por bisección
  api/explicar/route.ts

components/
  assumptions/  AssumptionsPanel  GroupAccordion  VariableRow  SliderInput
                AssumptionSearch  ModifiedBadge
  events/       TimelineEditor  EventCard
  results/      KpiStrip  CashflowChart  HerdChart  EquityChart  MonthlyTable
  risk/         TornadoChart  MonteCarloHistogram  FanChart  PercentileTable
  compare/      ScenarioMatrix  OverlayChart
  explain/      NarrativePanel  LossBreakdown  AiExplainButton  RemedyList
  scenarios/    ScenarioDrawer  ImportExportDialog

lib/
  assumptions/  schema.ts  defaults.ts  groups.ts  presets/stress.ts
  state/        useAssumptionsStore  useScenariosStore  useResultsStore  useUiStore
  sim/          useSimulation  useMonteCarlo  useTornado  runPool
  workers/      simulation.worker.ts
  explain/      metrics.ts  ledger.ts  rules.ts  narrative.ts  remedies.ts  format.ts
  storage/      persist.ts  idb.ts  portable.ts
```

La gestión de escenarios es un **Drawer** del topbar, no una pantalla. Las pruebas de estrés
aplican overrides y navegan al simulador con `?preset=sequia-severa`.

**`lib/assumptions/schema.ts` es la pieza clave**: un registro tipado del que se renderiza todo
el panel, y que también alimenta el barrido de sensibilidad y los rangos de Monte Carlo.

```ts
{ id:'milkPrice', path:'milk.pricePerLiter', group:'leche',
  label:'Precio de la leche', unit:'USD/L',
  min:0.2, max:1.2, step:0.01, default:0.65,
  tier:'destacada', synonyms:['precio','litro','venta'],
  mc:{ dist:'triangular', min:0.35, mode:0.65, max:0.85 },
  help:'Precio neto pagado por litro puesto en planta' }
```

**Estado**: Zustand + immer con slices. Suscripción por selector para que mover un slider no
re-renderice los ~80 controles. El slider mantiene su valor en estado local durante el arrastre
(60 fps garantizados) y hace commit al store con debounce trailing de 120 ms; commit inmediato en
`pointerUp`, blur y teclado. Cada corrida lleva `runId`; los resultados stale se descartan.
Mientras recalcula, las gráficas siguen mostrando el output anterior atenuado — nunca en blanco.

**Worker**: uno dedicado con protocolo `{type:'RUN'|'MONTECARLO'|'TORNADO'|'CANCEL', runId}`.
Obligatorio para Monte Carlo, tornado y comparador multi-escenario. Monte Carlo en chunks de 200
iteraciones con progreso determinista y cancelación entre chunks; devuelve percentiles y bins ya
reducidos como `Float64Array` transferible, no 5.000 outputs.

**UX del panel de supuestos** (~80 variables): toggle "Solo destacadas" activo por defecto
(~12 visibles), acordeones por las 7 categorías del documento con badge de cuántas modificaste,
búsqueda por label y sinónimos, toggle "Ver solo lo que cambié", delta vs base en color con botón
de reset por variable, y slider **más** input numérico (el ganadero teclea 0.50, no arrastra).

```
┌─────────────────────────────────────────────────────────────────────────┐
│ VAKA │ Escenario: Pesimista ▾ │ Guardar │ Exportar │ ● recalculando…    │
│ Simulador · Estrés · Riesgo · Comparar · Preguntas                      │
├──────────────────────────┬──────────────────────────────────────────────┤
│ SUPUESTOS       [8 ✎]    │ Patrimonio 10a  Caja mín.  TIR   Mes quiebre │
│ 🔍 buscar…               │  $412.300 ▼18%  -$24.500   11%     18        │
│ [Destacadas][Todas][Δ]   ├──────────────────────────────────────────────┤
│                          │ Resumen │ Caja │ Hato │ Patrimonio │ Tabla   │
│ ▾ Leche          [3 ✎]   │                                              │
│  Precio USD/L            │   ╭─ Flujo de caja mensual (base vs esc.) ─╮ │
│  0.50  ──●───── Δ-23%↺   │   │        ╱‾‾╲___                        │ │
│  Litros/vaca/día         │   │ ──────╱───────╲────────── 0            │ │
│  9.0   ─────●──          │   │              ╲___ mes 18               │ │
│  Mix canales  ▸          │   ╰────────────────────────────────────────╯ │
│ ▸ Sanidad        [2 ✎]   │                                              │
│ ▸ Reproducción           │  ⓘ EXPLICACIÓN                               │
│ ▸ Alimentación   [3 ✎]   │  Al bajar el precio 23%, tus ingresos caen   │
│ ▸ Personal               │  USD 3.200/mes. Absorbes 6 meses con caja.   │
│ ▸ Infraestructura        │  En el mes 18 quedas sin liquidez…           │
│ ▸ Macroeconomía          │  Necesitas: aportar $24.500 · vender 18      │
│ ─── Eventos temporales   │  animales · retrasar la ampliación.          │
│ + Añadir evento          │  [ Explicar con IA ]                         │
└──────────────────────────┴──────────────────────────────────────────────┘
```

### Capa de explicaciones (`lib/explain/`)

Pipeline determinista de tres etapas. Las cifras **siempre** vienen del motor, nunca del LLM.

`metrics.ts` → `deriveFindings(base, scenario)`: `monthlyRevenueDelta`, `firstNegativeCashMonth`,
`monthsOfBuffer`, `maxDeficit`, `capitalNeeded`, `equityAt{12,36,60,120}`, `insolvencyProb`, etc.

`ledger.ts` → `classifyLoss()`, que responde a las líneas 310-317 con **fuentes distintas**, no
reetiquetados del mismo número:

| Concepto | Cálculo |
|---|---|
| Pérdida de caja | Δ del saldo acumulado mínimo |
| Pérdida contable | Δ utilidad neta acumulada (incluye depreciación y mortalidad) |
| Reducción de patrimonio | Δ (activos − pasivos) al mes 120 |
| Dinero convertido en activos | capex + Δ valor del inventario de ganado |
| Costo de oportunidad | capital aportado × tasa alternativa − retorno realizado |
| Riesgo futuro | prob. insolvencia + meses de colchón (Monte Carlo) |

Se muestra como waterfall con la frase explícita: *"Gastaste USD 46.000 pero no los perdiste: se
convirtieron en 34 novillas valoradas hoy en USD 41.000."*

`rules.ts` → reglas `{ id, priority, severity, when(f), render(f) }`. `narrative.ts` filtra las
disparadas, ordena y agrupa en cuatro secciones fijas — **Qué cambió · Efecto en la caja ·
Efecto en el patrimonio · Qué hacer** — reproduciendo la cadena causal de la línea 7.
`remedies.ts` cuantifica las salidas: aporte = `maxDeficit`, animales a vender =
`ceil(maxDeficit / precioPromedio)`, capex diferible dentro de la ventana de déficit.

`app/api/explicar/route.ts`: runtime nodejs, streaming, body validado con Zod. Recibe solo
`findings`, `lossBreakdown`, el borrador determinista y un resumen anual de 10 filas — nunca los
120 meses ni los supuestos crudos. System prompt: asesor financiero ganadero latinoamericano,
español llano, **prohibido inventar o recalcular cifras**. System prompt y glosario con
`cache_control: {type:'ephemeral'}`. `ANTHROPIC_API_KEY` server-only. El texto determinista se
renderiza siempre primero; si el endpoint falla, no se pierde nada.

---

## Fases de entrega

Cada fase produce algo demostrable, no una capa horizontal inútil por sí sola.

**Fase 1 — Motor con tests.** Tipos, cohortes, lactancia, nutrición con feedback, finanzas,
`simulate()`, defaults de finca doble propósito venezolana. Suite Vitest. Demo: un script que
imprime 120 meses y cuadra.

**Fase 2 — Simulador vivo.** Scaffold Next.js, `schema.ts`, store Zustand, panel de supuestos,
KpiStrip, gráfica de caja, tabla mensual. Demo: mover el precio de la leche y ver la caja cambiar.

**Fase 3 — Escenarios y comparación.** Persistencia, Drawer, import/export JSON, `/comparar` con
la matriz de 15 métricas, gráficas de hato y patrimonio.

**Fase 4 — Narrativa determinista.** `metrics` + `ledger` + `rules` + `remedies`, NarrativePanel
y LossBreakdown. Demo: el párrafo de la línea 308 generado desde las cifras.

**Fase 5 — Worker y riesgo.** Migración al worker con runId y cancelación, Monte Carlo con
progreso, histograma, fan chart, percentiles, tornado con puntos de quiebre. Pantalla `/riesgo`.

**Fase 6 — Estrés, eventos temporales e IA.** Los 8 presets, TimelineEditor, `/preguntas` con
solvers de bisección, route handler de Claude con streaming. Pulido y deploy en Vercel.

---

## Verificación

**Motor (Vitest, `src/engine/**/*.test.ts`):**

- *Conservación del hato*: cada mes, `inicial + nacimientos − muertes − ventas − descarte = final`
  para toda categoría. Ningún animal aparece o desaparece sin registro.
- *Rezago reproductivo*: subir mortalidad de becerras de 5% a 15% **no** debe mover las vacas en
  ordeño en los meses 1-20, y sí reducirlas a partir del mes ~27.
- *Superaditividad*: `Δ(sequía + concentrado +40%)` debe ser estrictamente peor que
  `Δ(sequía) + Δ(concentrado)`. Es la prueba directa de la línea 212.
- *Cuadre financiero*: `caja[t] = caja[t-1] + operativo + inversión + financiamiento`;
  `activos = pasivos + patrimonio` cada mes; `patrimonio realizable < contable` con haircut > 0.
- *TIR/VAN*: contra valores calculados a mano en flujos simples de 3 periodos.
- *Determinismo*: misma semilla y mismos inputs → output byte-idéntico.
- *Overrides*: un `multiply 0.8` del mes 14 al 22 con recuperación lineal de 6 meses produce
  exactamente la serie de precios esperada.
- *Estabilidad*: sin overrides, la finca no debe oscilar ni explotar en 120 meses.

**Aplicación:** `pnpm dev`, y en el navegador — mover el precio de la leche de 0.65 a 0.50 y
verificar que la caja acumulada, el mes de quiebre y la narrativa se actualizan de forma coherente
y sin congelar la UI; correr Monte Carlo de 5.000 iteraciones y confirmar que la barra de progreso
avanza y la página sigue respondiendo; guardar dos escenarios, compararlos, exportar a JSON,
recargar la página e importar. Verificaré estos flujos en el navegador antes de dar por cerrada
cada fase.

**Riesgo conocido:** cualquier calibración de defaults es una estimación hasta que el usuario la
contraste con sus números reales. La app mostrará las tablas de respuesta nutricional como
parámetros editables y visibles, no como constantes escondidas en el código.

---

## Supuestos de modelado que conviene revisar al ver la app corriendo

1. **`% de vacas en ordeño` es salida, no entrada.** El documento lo lista como variable editable
   (línea 16), pero en un modelo por cohortes es emergente. Lo expongo como calibración del hato
   inicial más un override de "eficiencia de ordeño".
2. **Fertilidad ligada a BCS, no a NBR**: introduce un rezago de 2-4 meses que es biológicamente
   correcto, pero suaviza el impacto inmediato de una sequía.
3. **Becerro al pie** consumiendo 3-6 L/día con amamantamiento restringido. Cambia el ingreso por
   vaca entre 15-25%; es el supuesto más sensible del modelo doble propósito.
4. **Gestación de 9 meses en malla mensual** (283 días ≈ 9.3): sesgo de ~3% en el intervalo entre
   partos. Aceptable; la alternativa semanal cuesta 4.3× en cómputo.
5. **Mortalidad de becerras por perfil de edad**, no tasa plana: en la práctica se concentra en los
   primeros 60 días.
6. **Sin estocasticidad demográfica** en la corrida base (todo es valor esperado). Con 60-100
   animales la varianza binomial real es material; Monte Carlo la aproxima vía rangos de
   parámetros, no muestreando eventos individuales.
7. **Capital call automático** enmascara la insolvencia: será opt-in y el flag `insolvent` se
   registra igual.
8. **Curva de crecimiento de peso vivo** (lineal por tramos) es necesaria, no opcional: alimenta
   tanto la valuación por kg como la demanda de materia seca.
