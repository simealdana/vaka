'use client';

import { useState } from 'react';
import { AssumptionsPanel } from '@/components/assumptions/AssumptionsPanel';
import { NarrativePanel } from '@/components/explain/NarrativePanel';
import { KpiStrip } from '@/components/results/KpiStrip';
import { MonthlyTable } from '@/components/results/MonthlyTable';
import {
  CashflowChart,
  EquityChart,
  FeedChart,
  HerdChart,
  MilkChart,
} from '@/components/results/ResultCharts';
import { useSimulation } from '@/lib/sim/useSimulation';
import { useAssumptionsStore } from '@/lib/state/useAssumptionsStore';

const TABS = [
  { id: 'caja', label: 'Caja', Chart: CashflowChart },
  { id: 'patrimonio', label: 'Patrimonio', Chart: EquityChart },
  { id: 'hato', label: 'Hato', Chart: HerdChart },
  { id: 'leche', label: 'Leche', Chart: MilkChart },
  { id: 'alimentacion', label: 'Nutrición', Chart: FeedChart },
  { id: 'tabla', label: 'Tabla mensual', Chart: null },
] as const;

export default function SimuladorPage() {
  const { output, base, modified, assumptions } = useSimulation();
  const edits = useAssumptionsStore((s) => s.edits);
  const overrides = useAssumptionsStore((s) => s.overrides);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('caja');
  const [panel, setPanel] = useState(false);
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const edited = Object.keys(edits).length;

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-80 shrink-0 border-r border-zinc-200 bg-white lg:block">
        <AssumptionsPanel />
      </aside>

      {panel ? (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPanel(false)} />
          <aside className="relative flex w-[min(20rem,85vw)] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
              <span className="text-[13px] font-semibold">Supuestos</span>
              <button
                type="button"
                onClick={() => setPanel(false)}
                aria-label="Cerrar supuestos"
                className="-mr-1 rounded px-2 py-1 text-[16px] leading-none text-zinc-400 hover:bg-zinc-100"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <AssumptionsPanel />
            </div>
          </aside>
        </div>
      ) : null}

      <main className="min-w-0 flex-1 overflow-y-auto overscroll-contain bg-zinc-50">
        <KpiStrip summary={output.summary} base={base.summary} />

        {output.warnings.length > 0 ? (
          <ul className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-900">
            {output.warnings.map((w) => (
              <li key={w.code}>⚠ {w.message}</li>
            ))}
          </ul>
        ) : null}

        <div className="space-y-4 p-3 pb-24 sm:p-4 lg:pb-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-2 sm:p-3">
            <div className="mb-2 flex items-center gap-2">
              <div className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 pb-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`shrink-0 whitespace-nowrap rounded px-2.5 py-1 text-[12px] font-medium ${
                      tab === t.id ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <span className="hidden shrink-0 text-[11px] text-zinc-400 sm:inline">
                {modified ? 'escenario modificado' : 'finca base'}
              </span>
            </div>

            {active.Chart ? (
              <active.Chart output={output} base={base} modified={modified} />
            ) : (
              <MonthlyTable output={output} />
            )}
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-3 sm:p-4">
            <NarrativePanel
              base={base}
              output={output}
              assumptions={assumptions}
              edits={edits}
              overrides={overrides}
            />
          </div>
        </div>
      </main>

      <button
        type="button"
        onClick={() => setPanel(true)}
        className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-3 text-[13px] font-medium text-white shadow-lg lg:hidden"
      >
        Supuestos
        {edited > 0 ? (
          <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-zinc-900">
            {edited}
          </span>
        ) : null}
      </button>
    </div>
  );
}
