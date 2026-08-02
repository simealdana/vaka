'use client';

import { useEffect, useMemo, useState } from 'react';
import { FanChart } from '@/components/risk/FanChart';
import { MonteCarloHistogram } from '@/components/risk/MonteCarloHistogram';
import { PercentileTable } from '@/components/risk/PercentileTable';
import { TornadoChart } from '@/components/risk/TornadoChart';
import { formatMetric, formatVariable } from '@/components/risk/format';
import { MC_METRICS } from '@/engine/analysis/montecarlo';
import { decimals, pct } from '@/lib/format';
import { useSimulationWorker } from '@/lib/workers/useSimulationWorker';

const ITERATION_CHOICES = [500, 1000, 2000, 5000];

export default function RiesgoPage() {
  const worker = useSimulationWorker();
  const [iterations, setIterations] = useState(1000);
  const [seed, setSeed] = useState(20260802);
  const [metricKey, setMetricKey] = useState('bookEquity');
  const [fanKey, setFanKey] = useState('cash');
  const [threshold, setThreshold] = useState(0);
  const [tick, setTick] = useState(0);

  const running = worker.status === 'running';

  // Reloj del hilo principal: si la UI se congelara, este contador se quedaría quieto.
  // Es la prueba visible de que el cálculo pesado no vive aquí.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [running]);

  const mc = worker.monteCarlo;
  const metric = MC_METRICS.find((m) => m.key === metricKey) ?? MC_METRICS[0];
  const selected = mc?.metrics.find((m) => m.key === metricKey) ?? mc?.metrics[0];
  const fan = mc?.fan.find((f) => f.key === fanKey) ?? mc?.fan[0];

  const share = worker.progress.total > 0 ? worker.progress.done / worker.progress.total : 0;

  const worstSample = useMemo(() => {
    if (!mc || mc.worstSample.length !== mc.variables.length) return [];
    return mc.variables.map((v, i) => ({ ...v, value: mc.worstSample[i] }));
  }, [mc]);

  return (
    <main className="min-h-0 flex-1 overflow-auto bg-zinc-50 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-sm font-semibold">Riesgo</h1>
        <span className="text-[12px] text-zinc-500">
          Monte Carlo sobre los rangos declarados y sensibilidad variable por variable.
        </span>
      </div>

      <section className="mb-3 rounded-lg border border-zinc-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-500">Iteraciones</span>
            <select
              value={iterations}
              onChange={(e) => setIterations(Number(e.target.value))}
              className="rounded border border-zinc-200 px-2 py-1 text-[12px] text-zinc-800"
            >
              {ITERATION_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {decimals(n, 0)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-500">Semilla</span>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              className="w-32 rounded border border-zinc-200 px-2 py-1 text-[12px] tabular-nums text-zinc-800"
            />
          </label>

          <button
            type="button"
            onClick={() => worker.runMonteCarlo({ iterations, seed })}
            disabled={running}
            className="rounded bg-emerald-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:bg-zinc-300"
          >
            Correr Monte Carlo
          </button>

          <button
            type="button"
            onClick={() => worker.runTornado({ metricKey, threshold })}
            disabled={running}
            className="rounded bg-zinc-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-zinc-700 disabled:bg-zinc-300"
          >
            Calcular sensibilidad
          </button>

          <button
            type="button"
            onClick={worker.cancel}
            disabled={!running}
            className="rounded bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100 disabled:text-zinc-300"
          >
            Cancelar
          </button>

          <span className="text-[11px] text-zinc-400">
            {worker.poolSize} worker{worker.poolSize === 1 ? '' : 's'} · la simulación no corre en
            esta pestaña
          </span>
        </div>

        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded bg-zinc-100">
            <div
              data-testid="risk-progress"
              className="h-full rounded bg-emerald-500 transition-[width] duration-150"
              style={{ width: `${Math.round(share * 100)}%` }}
            />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-zinc-500">
            <span data-testid="risk-status">
              {worker.status === 'idle'
                ? 'Sin correr'
                : running
                  ? `Calculando ${worker.job === 'tornado' ? 'sensibilidad' : 'Monte Carlo'}: ${decimals(
                      worker.progress.done,
                      0,
                    )} / ${decimals(worker.progress.total, 0)}`
                  : worker.status === 'cancelled'
                    ? 'Cancelado'
                    : worker.status === 'error'
                      ? `Error: ${worker.error ?? ''}`
                      : 'Listo'}
            </span>
            {running ? (
              <span data-testid="risk-heartbeat">latido de la UI: {tick}</span>
            ) : null}
            {mc && !running ? (
              <span>
                {decimals(mc.iterations, 0)} iteraciones en {decimals(mc.elapsedMs / 1000, 1)} s
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {mc ? (
        <>
          <section className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi
              label="Prob. de quedarse sin caja"
              value={pct(mc.probInsolvency, 1)}
              alarm={mc.probInsolvency > 0.1}
            />
            <Kpi
              label="Prob. de patrimonio negativo"
              value={pct(mc.probEquityLoss, 1)}
              alarm={mc.probEquityLoss > 0.05}
            />
            <Kpi
              label="Peor patrimonio simulado"
              value={formatMetric(mc.worstEquity, 'money')}
              alarm={mc.worstEquity < 0}
            />
            <Kpi label="Semilla" value={decimals(mc.seed, 0)} />
          </section>

          <section className="mb-3">
            <PercentileTable result={mc} selected={metric.key} onSelect={setMetricKey} />
          </section>

          <section className="mb-3 grid gap-3 xl:grid-cols-2">
            {selected ? <MonteCarloHistogram metric={selected} /> : null}
            {fan ? (
              <div>
                <div className="mb-1 flex flex-wrap gap-1">
                  {mc.fan.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFanKey(f.key)}
                      className={`rounded px-2 py-1 text-[11px] font-medium ${
                        f.key === fan.key
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <FanChart series={fan} />
              </div>
            ) : null}
          </section>

          <section className="mb-3 rounded-lg border border-zinc-200 bg-white p-3">
            <h2 className="mb-1 text-[13px] font-semibold text-zinc-800">
              La peor corrida (iteración {decimals(mc.worstIteration, 0)})
            </h2>
            <p className="mb-2 text-[11px] text-zinc-500">
              Con la semilla {decimals(mc.seed, 0)} esta combinación se reproduce exactamente.
              Cópiala al panel de supuestos para verla mes a mes.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-zinc-700">
              {worstSample.map((v) => (
                <span key={v.path} className="tabular-nums">
                  <span className="text-zinc-500">{v.label}:</span>{' '}
                  {formatVariable(v.path, v.value)}
                </span>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <section className="mb-3 rounded-lg border border-zinc-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-500">Métrica del tornado</span>
            <select
              value={metricKey}
              onChange={(e) => setMetricKey(e.target.value)}
              className="rounded border border-zinc-200 px-2 py-1 text-[12px] text-zinc-800"
            >
              {MC_METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-500">Umbral de quiebre</span>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-32 rounded border border-zinc-200 px-2 py-1 text-[12px] tabular-nums text-zinc-800"
            />
          </label>
        </div>
        {worker.tornado ? (
          <TornadoChart
            bars={worker.tornado}
            metric={metric}
            baseMetric={worker.tornado[0]?.baseMetric ?? null}
            threshold={threshold}
          />
        ) : (
          <p className="text-[12px] text-zinc-500">
            Pulsa «Calcular sensibilidad» para barrer cada variable de su mínimo a su máximo y
            buscar por bisección el valor en que la métrica cruza el umbral.
          </p>
        )}
      </section>
    </main>
  );
}

function Kpi({ label, value, alarm }: { label: string; value: string; alarm?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div
        className={`text-[15px] font-semibold tabular-nums ${
          alarm ? 'text-red-600' : 'text-zinc-800'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
