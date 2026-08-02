'use client';

import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FAN_LEVELS, type McFanResult } from '@/engine/analysis/montecarlo';
import { decimals, moneyCompact } from '@/lib/format';

const YEAR_TICKS = [1, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120];

const P10 = FAN_LEVELS.indexOf(0.1);
const P25 = FAN_LEVELS.indexOf(0.25);
const P50 = FAN_LEVELS.indexOf(0.5);
const P75 = FAN_LEVELS.indexOf(0.75);
const P90 = FAN_LEVELS.indexOf(0.9);

/** Bandas de incertidumbre mes a mes: el 80% y el 50% central de las corridas. */
export function FanChart({ series }: { series: McFanResult }) {
  const format = series.format === 'money' ? moneyCompact : (n: number) => decimals(n, 0);

  const data = useMemo(() => {
    const at = (level: number, month: number) => series.bands[level * series.horizon + month];
    return Array.from({ length: series.horizon }, (_, m) => ({
      month: m + 1,
      banda80: [at(P10, m), at(P90, m)] as [number, number],
      banda50: [at(P25, m), at(P75, m)] as [number, number],
      mediana: at(P50, m),
    }));
  }, [series]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <h2 className="mb-1 text-[13px] font-semibold text-zinc-800">
        {series.label} · abanico de escenarios
      </h2>
      <div className="h-56 w-full sm:h-72">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#f1f1f4" vertical={false} />
            <XAxis
              dataKey="month"
              ticks={YEAR_TICKS}
              tick={{ fontSize: 11, fill: '#a1a1aa' }}
              tickLine={false}
              axisLine={{ stroke: '#e4e4e7' }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#a1a1aa' }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={format}
            />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
            <Tooltip
              labelFormatter={(m) => `Mes ${String(m)}`}
              formatter={(value, name) =>
                Array.isArray(value)
                  ? [`${format(Number(value[0]))} … ${format(Number(value[1]))}`, String(name)]
                  : [format(Number(value)), String(name)]
              }
              contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e4e4e7' }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
            <Area
              dataKey="banda80"
              name="P10–P90"
              stroke="none"
              fill="#059669"
              fillOpacity={0.12}
              isAnimationActive={false}
            />
            <Area
              dataKey="banda50"
              name="P25–P75"
              stroke="none"
              fill="#059669"
              fillOpacity={0.22}
              isAnimationActive={false}
            />
            <Line
              dataKey="mediana"
              name="Mediana"
              type="monotone"
              stroke="#0f766e"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
