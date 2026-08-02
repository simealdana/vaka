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

- **Fase 5 — Riesgo.** `src/engine/analysis/` (`rng.ts` mulberry32 sembrado, `montecarlo.ts`,
  `sensitivity.ts`, `breakpoint.ts`), pool de workers en `src/lib/workers/`, `src/lib/sim/mcInputs.ts`
  (recentra los rangos `MC_VARIABLES` sobre la finca activa) y `/proyecto/[id]/riesgo` con
  histograma, fan chart, percentiles y tornado.
- **Fase 6 — Estrés, eventos y preguntas.** 8 presets en `src/lib/assumptions/presets/stress.ts`,
  `/proyecto/[id]/estres` (aplica overrides y vuelve al simulador), `src/components/events/`
  montado en el panel bajo «Eventos temporales», y `/proyecto/[id]/preguntas` con las 15 preguntas
  resueltas por bisección (`src/lib/questions/solve.ts`).

Las cinco pantallas están en el `NAV` de `src/components/Topbar.tsx`, que guarda segmentos
relativos que `NavLinks` cuelga de `/proyecto/${projectId}`.

**Lo que falta / quedó dudoso:**

- El Monte Carlo muestrea cada variable de forma independiente: **no hay correlación** entre ellas
  (falta una cópula gaussiana), así que el P10 sale optimista.
- La mediana Monte Carlo de patrimonio (~$510k) queda muy por debajo del determinista ($765k).
  Sospecha razonable: los rangos `mc` de `src/lib/assumptions/schema.ts` están sesgados a la baja.
  Revisar antes de presentarle los percentiles a nadie.
- El VAN sale negativo en el 100% de las corridas con TIR mediana de 3,5%: verificar que la tasa de
  descuento por defecto es la que se quiere.
- `src/engine/feedback.test.ts` documenta un hallazgo contraintuitivo: sequía + concentrado caro
  **no** es superaditivo, porque la sequía reduce la leche que consume el concentrado.
- El route handler `src/app/api/explicar/route.ts` no se probó contra la API real con
  `ANTHROPIC_API_KEY`.
- Sin desplegar en Vercel.

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
- El Monte Carlo corre en un pool de workers: 5.000 iteraciones tardan ~2,5 s sin bloquear el hilo
  principal, y la cancelación entre chunks descarta resultados stale por `runId`.
