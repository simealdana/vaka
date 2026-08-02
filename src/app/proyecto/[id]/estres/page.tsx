'use client';

import { useRouter } from 'next/navigation';
import { use, useMemo } from 'react';
import { STRESS_PRESETS, instantiate } from '@/lib/assumptions/presets/stress';
import { decimals, money, signedPct } from '@/lib/format';
import { baselineOutput, runScenario } from '@/lib/sim/useSimulation';
import { useAssumptionsStore } from '@/lib/state/useAssumptionsStore';

interface Impact {
  equity: number;
  equityPct: number;
  irr: number | null;
  capital: number;
  liters: number;
  herd: number;
}

export default function EstresPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const projectBase = useAssumptionsStore((s) => s.base);

  // Cada tarjeta muestra el daño ya calculado: si hay que hacer clic para saber si duele,
  // la pantalla no sirve para comparar las ocho crisis de un vistazo.
  const impacts = useMemo(() => {
    const base = baselineOutput(projectBase).summary;
    const map = new Map<string, Impact>();
    for (const preset of STRESS_PRESETS) {
      const s = runScenario(
        { edits: {}, overrides: preset.overrides.map(instantiate) },
        projectBase,
      ).summary;
      map.set(preset.id, {
        equity: s.finalBookEquity - base.finalBookEquity,
        equityPct:
          base.finalBookEquity === 0
            ? 0
            : (s.finalBookEquity - base.finalBookEquity) / Math.abs(base.finalBookEquity),
        irr: s.irrAnnual,
        capital: s.maxCapitalRequired,
        liters:
          base.totalMilkLiters === 0
            ? 0
            : (s.totalMilkLiters - base.totalMilkLiters) / base.totalMilkLiters,
        herd: s.finalHerd - base.finalHerd,
      });
    }
    return map;
  }, [projectBase]);

  const worst = useMemo(() => {
    let id = '';
    let value = Infinity;
    for (const [key, impact] of impacts) {
      if (impact.equity < value) {
        value = impact.equity;
        id = key;
      }
    }
    return id;
  }, [impacts]);

  return (
    <main className="min-h-0 flex-1 overflow-auto bg-zinc-50 p-3 sm:p-4">
      <div className="mb-3">
        <h1 className="text-sm font-semibold">Pruebas de estrés</h1>
        <p className="mt-0.5 max-w-2xl text-[12px] text-zinc-500">
          Ocho crisis completas medidas contra la finca base de este proyecto. Cada cifra ya está
          calculada: al aplicar una, el simulador queda cargado con sus eventos y puedes seguir
          moviendo supuestos encima.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {STRESS_PRESETS.map((preset) => {
          const impact = impacts.get(preset.id);
          if (!impact) return null;
          const isWorst = preset.id === worst;
          return (
            <article
              key={preset.id}
              className={`flex flex-col rounded-lg border bg-white p-3 ${
                isWorst ? 'border-red-300 ring-1 ring-red-100' : 'border-zinc-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[13px] font-semibold text-zinc-900">{preset.label}</h2>
                {isWorst ? (
                  <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                    la peor
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[11px] font-medium text-zinc-500">{preset.question}</p>
              <p className="mt-1.5 text-[12px] leading-snug text-zinc-600">{preset.description}</p>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-zinc-100 pt-2.5 text-[12px] tabular-nums">
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-zinc-400">Δ patrimonio</dt>
                  <dd className="font-semibold text-red-600">
                    {money(impact.equity)}{' '}
                    <span className="font-normal text-zinc-400">
                      ({signedPct(impact.equityPct, 1)})
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-zinc-400">TIR anual</dt>
                  <dd className="font-semibold text-zinc-800">
                    {impact.irr === null ? '—' : `${decimals(impact.irr * 100, 2)}%`}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-zinc-400">Δ leche</dt>
                  <dd className="text-zinc-700">{signedPct(impact.liters, 1)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-zinc-400">Δ hato</dt>
                  <dd className="text-zinc-700">
                    {impact.herd >= 0 ? '+' : '−'}
                    {decimals(Math.abs(impact.herd), 0)} animales
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[10px] uppercase tracking-wide text-zinc-400">
                    Capital extra requerido
                  </dt>
                  <dd className={impact.capital > 0 ? 'font-semibold text-amber-700' : 'text-zinc-500'}>
                    {impact.capital > 0 ? money(impact.capital) : 'ninguno'}
                  </dd>
                </div>
              </dl>

              <ul className="mt-2.5 space-y-0.5 border-t border-zinc-100 pt-2 text-[11px] text-zinc-500">
                {preset.overrides.map((o) => (
                  <li key={`${o.target}-${o.label}`}>
                    • {o.label}
                    {o.durationMonths === Number.POSITIVE_INFINITY
                      ? ' (permanente)'
                      : ` (${o.durationMonths} meses desde el mes ${o.startMonth + 1})`}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => router.push(`/proyecto/${id}?preset=${preset.id}`)}
                className="mt-3 w-full rounded bg-zinc-900 px-3 py-2 text-[12px] font-medium text-white hover:bg-zinc-700"
              >
                Aplicar en el simulador
              </button>
            </article>
          );
        })}
      </div>
    </main>
  );
}
