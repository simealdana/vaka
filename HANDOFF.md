# Handoff — VAKA

Estado del proyecto y los dos encargos que quedan, listos para pasarle a un agente nuevo.

## Estado actual

Fases 1 a 4 del plan (`PLAN.md`, en la raíz del repo) están completas, más la capa
de **proyectos (fincas)** que no estaba en el plan original:

- **Fase 1 — Motor.** `src/engine/`, TypeScript puro y determinista. `simulate(assumptions, overrides)`
  corre 120 meses en pocos ms. Modelo de hato por cohortes, feedback NBR → BCS, doble patrimonio.
- **Fase 2 — Simulador.** Panel de ~80 supuestos, KPIs, gráficas, tabla mensual.
- **Fase 3 — Escenarios.** Persistencia (localStorage + IndexedDB), drawer, import/export JSON, `/comparar`.
- **Fase 4 — Narrativa determinista.** `src/lib/explain/` (findings → ledger → rules → narrative →
  remedies) y el botón «Explicar con IA» contra `src/app/api/explicar/route.ts`.
- **Proyectos.** Dos niveles: cada proyecto es una finca con su configuración base y, dentro, sus
  escenarios. La lista de fincas es la raíz `/` (`src/app/page.tsx`), switcher en el topbar,
  borrador de trabajo por finca. Cada finca vive en `/proyecto/[id]` (simulador) y
  `/proyecto/[id]/comparar`.
- **Adquisición.** Bloque `acquisition` en `Assumptions` (`isPurchase`, `landCost`, `herdCost`,
  `infrastructureCost`, `closingCost`). En modo compra `equityFlows[0]` es el desembolso propio
  (pagado + caja − deuda) en vez del valor de liquidación implícito, así que la TIR responde «¿me
  conviene comprar a este precio?». Nuevos campos de resumen: `initialInvestment`,
  `acquisitionCost`, `entryGain`, `totalCapitalRequired`. El alta de finca ya pregunta en plata.

Verificación al cerrar: `npx tsc --noEmit` limpio, `npx eslint src scripts` limpio, 46 tests Vitest
en verde, y los flujos de proyectos comprobados en Chromium (crear finca, cambiar de finca, KPIs por
tarjeta, persistencia tras recargar, borrado con confirmación).

**Lo que falta:** las pantallas de riesgo, estrés y preguntas no existen todavía. Van bajo
`/proyecto/[id]/…`, no en la raíz: `src/app/proyecto/[id]/riesgo/page.tsx`,
`.../estres/page.tsx`, `.../preguntas/page.tsx`. Sus enlaces se quitaron del `NAV` de
`src/components/Topbar.tsx` para no dejar 404 a la vista; hay que reponerlos al construir cada
pantalla añadiendo `{ segment: '/riesgo', label: 'Riesgo' }` y equivalentes — el `NAV` guarda
segmentos relativos y `NavLinks` los cuelga de `/proyecto/${projectId}`. Son justamente las dos
fases de abajo.

## Notas para quien siga

- `AGENTS.md` manda: esta versión de Next.js tiene breaking changes respecto a lo que conoces.
  Lee la guía correspondiente en `node_modules/next/dist/docs/` antes de escribir código.
- Todas las series de Recharts llevan `isAnimationActive={false}`. Sin eso, la animación de entrada
  redibuja las líneas truncadas en cada recálculo y parece un bug del motor.
- `runScenario(scenario, base)` y `baselineOutput(base)` en `src/lib/sim/useSimulation.ts` reciben la
  configuración de la finca activa, que vive en `useAssumptionsStore.getState().base`.
- Playwright está instalado globalmente en
  `/Users/simeonaldana/.npm-global/lib/node_modules/playwright/index.mjs`. En modo dev la hidratación
  tarda: espera a que el contenido exista antes de hacer click, o el handler todavía no está montado.

---

## Agente A — Fase 5: worker, Monte Carlo y sensibilidad

El repo es `/Users/simeonaldana/Documents/venek-vaka`. Es un simulador de escenarios para fincas
ganaderas de doble propósito; el plan completo está en `PLAN.md`, en la raíz del repo (lee la
Fase 5 y la sección «Verificación»). Lee `AGENTS.md`: esta versión de Next.js tiene breaking changes, consulta
`node_modules/next/dist/docs/` antes de escribir código.

El motor (`src/engine/`) es TypeScript puro y determinista: `simulate(assumptions, overrides)` corre
120 meses en pocos ms. Hoy todo corre en el hilo principal desde `src/lib/sim/useSimulation.ts`, que
ya está adaptado a los proyectos: `baselineOutput(base: EditMap)` y `runScenario(scenario, base)`
reciben la configuración de la finca activa, que sale de `useAssumptionsStore.getState().base`.

Tu trabajo:

1. `src/lib/workers/simulation.worker.ts` con el protocolo
   `{type:'RUN'|'MONTECARLO'|'TORNADO'|'CANCEL', runId}`. Los resultados stale se descartan por `runId`.
2. Monte Carlo en chunks de 200 iteraciones, con progreso y cancelación entre chunks. Crea
   `src/engine/analysis/` (`montecarlo.ts`, `rng.ts` con mulberry32 sembrado, `sensitivity.ts`,
   `breakpoint.ts`); hoy ese directorio no existe. Devuelve percentiles y bins ya reducidos como
   `Float64Array` transferible, nunca 5.000 outputs.
3. Los rangos de cada variable salen de `mc: {dist, min, mode, max}` en
   `src/lib/assumptions/schema.ts` (`MC_VARIABLES`, ya exportado).
4. Pantalla `src/app/proyecto/[id]/riesgo/page.tsx` con histograma, fan chart, tabla de percentiles
   y tornado con puntos de quiebre. Componentes en `src/components/risk/`. Repón el enlace en el
   `NAV` de `src/components/Topbar.tsx` con `{ segment: '/riesgo', label: 'Riesgo' }`.
   **Obligatorio**: todas las series de Recharts llevan `isAnimationActive={false}`.

Verifica en el navegador con Playwright (instalación global en
`/Users/simeonaldana/.npm-global/lib/node_modules/playwright/index.mjs`, dev server en
`localhost:3000`): 5.000 iteraciones con la barra de progreso avanzando y la página respondiendo.
Deja `npx tsc --noEmit`, `npx eslint src scripts` y `npx vitest run` en verde.

---

## Agente B — Fase 6: estrés, eventos temporales y preguntas

El repo es `/Users/simeonaldana/Documents/venek-vaka`. Es un simulador de escenarios para fincas
ganaderas de doble propósito; el plan completo está en `PLAN.md`, en la raíz del repo (lee la
Fase 6), y la especificación
original en `intruction.md` (las 15 preguntas están al final; la línea 212 explica la
superaditividad). Lee `AGENTS.md`: esta versión de Next.js tiene breaking changes, consulta
`node_modules/next/dist/docs/` antes de escribir código.

Ya existen: el tipo `ScenarioOverride` en `src/engine/types.ts` (con `startMonth`, `durationMonths`,
`rampInMonths`, `recovery`, `repeat`, `priority`), su resolución precompilada en
`src/engine/scenario/resolve.ts`, y las acciones `addOverride` / `updateOverride` / `removeOverride`
en `src/lib/state/useAssumptionsStore.ts`. La serialización a JSON codifica
`durationMonths: Infinity` como `null` (`src/lib/storage/portable.ts`).

Tu trabajo:

1. Los 8 presets de estrés en `src/lib/assumptions/presets/stress.ts` y la pantalla
   `src/app/estres/page.tsx`. Aplican overrides y navegan al simulador con `?preset=sequia-severa`.
2. `src/components/events/TimelineEditor.tsx` y `EventCard.tsx`, montados en el panel de supuestos
   bajo «Eventos temporales».
3. `src/app/preguntas/page.tsx`: las 15 preguntas del documento resueltas por bisección sobre
   `runScenario(scenario, base)` de `src/lib/sim/useSimulation.ts` (ojo: el segundo argumento es la
   configuración de la finca activa, que sacas de `useAssumptionsStore.getState().base`).
4. El route handler `src/app/api/explicar/route.ts` ya está escrito y con streaming; falta comprobar
   que funciona con `ANTHROPIC_API_KEY` en `.env.local` y que el fallback 501 se ve bien en
   `src/components/explain/AiExplainButton.tsx`.
5. Deploy en Vercel. Pregunta antes de desplegar.

Verifica en el navegador con Playwright (instalación global en
`/Users/simeonaldana/.npm-global/lib/node_modules/playwright/index.mjs`, dev server en
`localhost:3000`). Deja `npx tsc --noEmit`, `npx eslint src scripts` y `npx vitest run` en verde.
Añade un test de superaditividad en `src/engine/` si no existe: `Δ(sequía + concentrado +40%)` debe
ser estrictamente peor que `Δ(sequía) + Δ(concentrado)`.

---

Los dos encargos son independientes salvo por `useAssumptionsStore`, que ninguno necesita modificar.
