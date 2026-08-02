'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { McMetric } from '@/engine/analysis/montecarlo';
import type { TornadoBar } from '@/engine/analysis/sensitivity';
import { formatMetric, formatMetricAxis, formatVariable } from './format';

interface Row {
  label: string;
  path: string;
  range: [number, number];
}

/**
 * Una variable a la vez, de su mínimo a su máximo declarado. La línea vertical es el
 * valor de hoy: lo que queda a su izquierda es lo que se pierde si esa variable se
 * mueve en contra.
 */
export function TornadoChart({
  bars,
  metric,
  baseMetric,
  threshold,
}: {
  bars: TornadoBar[];
  metric: McMetric;
  baseMetric: number | null;
  threshold: number;
}) {
  const rows = useMemo<Row[]>(
    () =>
      bars
        .filter((b) => b.lowMetric !== null && b.highMetric !== null)
        .map((b) => {
          const low = b.lowMetric as number;
          const high = b.highMetric as number;
          return {
            label: b.label,
            path: b.path,
            range: [Math.min(low, high), Math.max(low, high)] as [number, number],
          };
        }),
    [bars],
  );

  const breakpoints = bars.filter((b) => b.breakpoint);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[13px] font-semibold text-zinc-800">
          Sensibilidad · {metric.label}
        </h2>
        <span className="text-[11px] text-zinc-500">
          {baseMetric === null
            ? 'sin valor base'
            : `hoy: ${formatMetric(baseMetric, metric.format)}`}
          {' · umbral de quiebre: '}
          {formatMetric(threshold, metric.format)}
        </span>
      </div>

      <div className="w-full" style={{ height: Math.max(180, rows.length * 26 + 40) }}>
        <ResponsiveContainer>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
            barCategoryGap="18%"
          >
            <CartesianGrid stroke="#f1f1f4" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: '#a1a1aa' }}
              tickLine={false}
              axisLine={{ stroke: '#e4e4e7' }}
              tickFormatter={(v: number) => formatMetricAxis(v, metric.format)}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={150}
              tick={{ fontSize: 11, fill: '#52525b' }}
              tickLine={false}
              axisLine={false}
            />
            {baseMetric === null ? null : (
              <ReferenceLine x={baseMetric} stroke="#52525b" strokeDasharray="3 3" />
            )}
            <ReferenceLine x={threshold} stroke="#ef4444" strokeDasharray="2 4" />
            <Tooltip
              cursor={{ fill: '#f4f4f5' }}
              formatter={(value) =>
                Array.isArray(value)
                  ? [
                      `${formatMetric(Number(value[0]), metric.format)} … ${formatMetric(
                        Number(value[1]),
                        metric.format,
                      )}`,
                      'Rango',
                    ]
                  : [formatMetric(Number(value), metric.format), 'Rango']
              }
              contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e4e4e7' }}
            />
            <Bar dataKey="range" isAnimationActive={false} radius={2}>
              {rows.map((row) => (
                <Cell key={row.path} fill={row.range[0] < threshold ? '#ef4444' : '#059669'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 overflow-auto">
        <h3 className="mb-1 text-[12px] font-semibold text-zinc-700">Puntos de quiebre</h3>
        {breakpoints.length === 0 ? (
          <p className="text-[12px] text-zinc-500">
            Ninguna variable, por sí sola y dentro de su rango, lleva la métrica al umbral.
          </p>
        ) : (
          <table className="w-full border-collapse text-[12px] tabular-nums">
            <thead className="bg-zinc-50">
              <tr>
                <th className="border-b border-zinc-200 px-3 py-1.5 text-left font-medium text-zinc-500">
                  Variable
                </th>
                <th className="border-b border-l border-zinc-200 px-3 py-1.5 text-right font-medium text-zinc-500">
                  Hoy
                </th>
                <th className="border-b border-l border-zinc-200 px-3 py-1.5 text-right font-medium text-zinc-500">
                  Quiebre
                </th>
                <th className="border-b border-l border-zinc-200 px-3 py-1.5 text-right font-medium text-zinc-500">
                  Margen
                </th>
              </tr>
            </thead>
            <tbody>
              {breakpoints.map((bar) => {
                const point = bar.breakpoint as NonNullable<TornadoBar['breakpoint']>;
                const margin = bar.base === 0 ? null : (point.value - bar.base) / Math.abs(bar.base);
                return (
                  <tr key={bar.path} className="hover:bg-emerald-50/40">
                    <td className="border-b border-zinc-100 px-3 py-1.5 text-left text-zinc-600">
                      {bar.label}
                    </td>
                    <td className="border-b border-l border-zinc-100 px-3 py-1.5 text-right text-zinc-500">
                      {formatVariable(bar.path, bar.base)}
                    </td>
                    <td className="border-b border-l border-zinc-100 px-3 py-1.5 text-right font-medium text-red-600">
                      {formatVariable(bar.path, point.value)}
                    </td>
                    <td className="border-b border-l border-zinc-100 px-3 py-1.5 text-right text-zinc-600">
                      {margin === null
                        ? '—'
                        : `${margin > 0 ? '+' : '−'}${Math.abs(margin * 100).toFixed(0)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
