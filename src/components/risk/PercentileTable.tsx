'use client';

import { PERCENTILE_LEVELS, type McResult } from '@/engine/analysis/montecarlo';
import { pct } from '@/lib/format';
import { formatMetric } from './format';

const LEVEL_LABELS = PERCENTILE_LEVELS.map((p) => `P${Math.round(p * 100)}`);

/**
 * La lectura central del Monte Carlo: qué pasa en el 5% malo, en la mediana y en el 5%
 * bueno de los futuros posibles. P5 y P95 se destacan porque son los que se citan.
 */
export function PercentileTable({
  result,
  selected,
  onSelect,
}: {
  result: McResult;
  selected: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="overflow-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full border-collapse text-[12px] tabular-nums">
        <thead className="bg-zinc-50">
          <tr>
            <th className="sticky left-0 z-10 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-left font-medium text-zinc-500">
              Métrica
            </th>
            {LEVEL_LABELS.map((label) => (
              <th
                key={label}
                className={`whitespace-nowrap border-b border-l border-zinc-200 px-3 py-2 text-right font-medium ${
                  label === 'P5' || label === 'P95' ? 'text-zinc-800' : 'text-zinc-500'
                }`}
              >
                {label}
              </th>
            ))}
            <th className="whitespace-nowrap border-b border-l border-zinc-200 px-3 py-2 text-right font-medium text-zinc-500">
              Media
            </th>
            <th className="whitespace-nowrap border-b border-l border-zinc-200 px-3 py-2 text-right font-medium text-zinc-500">
              Prob. negativo
            </th>
          </tr>
        </thead>
        <tbody>
          {result.metrics.map((metric) => (
            <tr
              key={metric.key}
              onClick={() => onSelect(metric.key)}
              className={`cursor-pointer ${
                metric.key === selected ? 'bg-emerald-50' : 'hover:bg-emerald-50/40'
              }`}
            >
              <td
                className={`sticky left-0 z-10 max-w-[9.5rem] border-b border-zinc-100 px-3 py-1.5 text-left sm:max-w-none sm:whitespace-nowrap ${
                  metric.key === selected
                    ? 'bg-emerald-50 font-medium text-emerald-800'
                    : 'bg-white text-zinc-600'
                }`}
              >
                {metric.label}
              </td>
              {Array.from(metric.percentiles).map((value, i) => (
                <td
                  key={LEVEL_LABELS[i]}
                  className={`whitespace-nowrap border-b border-l border-zinc-100 px-3 py-1.5 text-right ${
                    value < 0 ? 'text-red-600' : 'text-zinc-800'
                  }`}
                >
                  {formatMetric(value, metric.format)}
                </td>
              ))}
              <td className="whitespace-nowrap border-b border-l border-zinc-100 px-3 py-1.5 text-right text-zinc-500">
                {formatMetric(metric.mean, metric.format)}
              </td>
              <td
                className={`whitespace-nowrap border-b border-l border-zinc-100 px-3 py-1.5 text-right ${
                  metric.shareNegative > 0 ? 'text-red-600' : 'text-zinc-400'
                }`}
              >
                {pct(metric.shareNegative, 1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
