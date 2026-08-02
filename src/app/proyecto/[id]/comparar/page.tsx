'use client';

import { useEffect, useMemo } from 'react';
import type { SimulationOutput } from '@/engine/types';
import { METRIC_ROWS } from '@/lib/metrics/summaryRows';
import { baselineOutput, runScenario } from '@/lib/sim/useSimulation';
import { useAssumptionsStore } from '@/lib/state/useAssumptionsStore';
import { useScenariosStore } from '@/lib/state/useScenariosStore';

interface Column {
  id: string;
  name: string;
  output: SimulationOutput;
}

export default function CompararPage() {
  const { list, comparing, refresh, toggleComparing } = useScenariosStore();
  const edits = useAssumptionsStore((s) => s.edits);
  const overrides = useAssumptionsStore((s) => s.overrides);
  const name = useAssumptionsStore((s) => s.name);
  const projectBase = useAssumptionsStore((s) => s.base);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const columns: Column[] = useMemo(() => {
    const base: Column = { id: '__base', name: 'Finca base', output: baselineOutput(projectBase) };
    const current: Column = {
      id: '__current',
      name: `${name} (en edición)`,
      output: runScenario({ edits, overrides }, projectBase),
    };
    const saved = list
      .filter((s) => comparing.includes(s.id))
      .map((s) => ({ id: s.id, name: s.name, output: runScenario(s, projectBase) }));
    return [base, current, ...saved];
  }, [list, comparing, edits, overrides, name, projectBase]);

  const baseSummary = columns[0].output.summary;

  return (
    <main className="min-h-0 flex-1 overflow-auto bg-zinc-50 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-sm font-semibold">Comparar escenarios</h1>
        <span className="text-[12px] text-zinc-500">
          Marca los guardados que quieras enfrentar contra la finca base.
        </span>
        <div className="flex flex-wrap gap-1">
          {list.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleComparing(s.id)}
              className={`rounded px-2 py-1 text-[11px] font-medium ${
                comparing.includes(s.id)
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full border-collapse text-[12px] tabular-nums">
          <thead className="sticky top-0 z-10 bg-zinc-50">
            <tr>
              <th className="sticky left-0 z-20 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-left font-medium text-zinc-500">
                Métrica
              </th>
              {columns.map((c) => (
                <th
                  key={c.id}
                  className="whitespace-nowrap border-b border-l border-zinc-200 px-3 py-2 text-right font-medium text-zinc-700"
                >
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRIC_ROWS.map((row) => {
              const reference = row.get(baseSummary);
              return (
                <tr key={row.key} className="group hover:bg-emerald-50/40">
                  <td className="sticky left-0 z-10 max-w-[9.5rem] border-b border-zinc-100 bg-white px-3 py-1.5 text-left text-zinc-600 group-hover:bg-emerald-50 sm:max-w-none sm:whitespace-nowrap">
                    {row.label}
                  </td>
                  {columns.map((c) => {
                    const value = row.get(c.output.summary);
                    const text = row.format(value);
                    // Solo se marca en rojo lo que el usuario ve distinto: dos cifras que
                    // redondean igual no son un empeoramiento aunque difieran en decimales.
                    const worse =
                      row.higherIsBetter !== null &&
                      value !== null &&
                      reference !== null &&
                      text !== row.format(reference) &&
                      row.higherIsBetter === value < reference;
                    return (
                      <td
                        key={c.id}
                        className={`whitespace-nowrap border-b border-l border-zinc-100 px-3 py-1.5 text-right ${
                          c.id === '__base' ? 'text-zinc-500' : worse ? 'text-red-600' : 'text-zinc-800'
                        }`}
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
