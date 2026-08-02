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
import { PERCENTILE_LEVELS, type McMetricResult } from '@/engine/analysis/montecarlo';
import { decimals, pct } from '@/lib/format';
import { formatMetric, formatMetricAxis } from './format';

const MEDIAN = PERCENTILE_LEVELS.indexOf(0.5);
const P5 = PERCENTILE_LEVELS.indexOf(0.05);
const P95 = PERCENTILE_LEVELS.indexOf(0.95);

/** Distribución de la métrica sobre todas las iteraciones, con la mediana marcada. */
export function MonteCarloHistogram({ metric }: { metric: McMetricResult }) {
  const data = useMemo(() => {
    const { counts, min, binWidth } = metric.histogram;
    return Array.from(counts, (count, i) => ({
      center: min + binWidth * (i + 0.5),
      count,
      share: metric.count > 0 ? count / metric.count : 0,
    }));
  }, [metric]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[13px] font-semibold text-zinc-800">{metric.label}</h2>
        <span className="text-[11px] text-zinc-500">
          mediana {formatMetric(metric.percentiles[MEDIAN], metric.format)} · P5{' '}
          {formatMetric(metric.percentiles[P5], metric.format)} · P95{' '}
          {formatMetric(metric.percentiles[P95], metric.format)}
        </span>
      </div>
      <div className="h-56 w-full sm:h-64">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#f1f1f4" vertical={false} />
            <XAxis
              dataKey="center"
              type="number"
              domain={['dataMin', 'dataMax']}
              tick={{ fontSize: 11, fill: '#a1a1aa' }}
              tickLine={false}
              axisLine={{ stroke: '#e4e4e7' }}
              tickFormatter={(v: number) => formatMetricAxis(v, metric.format)}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#a1a1aa' }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) => decimals(v, 0)}
            />
            <ReferenceLine x={0} stroke="#ef4444" strokeDasharray="3 3" />
            <ReferenceLine
              x={metric.percentiles[MEDIAN]}
              stroke="#0f766e"
              strokeDasharray="4 3"
              label={{ value: 'mediana', fontSize: 10, fill: '#0f766e', position: 'top' }}
            />
            <Tooltip
              cursor={{ fill: '#f4f4f5' }}
              labelFormatter={(v) => formatMetric(Number(v), metric.format)}
              formatter={(value, _name, item) => [
                `${decimals(Number(value), 0)} corridas (${pct(
                  (item?.payload as { share: number } | undefined)?.share ?? 0,
                  1,
                )})`,
                'Frecuencia',
              ]}
              contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e4e4e7' }}
            />
            <Bar dataKey="count" isAnimationActive={false}>
              {data.map((row, i) => (
                <Cell key={i} fill={row.center < 0 ? '#ef4444' : '#059669'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
