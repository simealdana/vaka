'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthlyResult, SimulationOutput } from '@/engine/types';
import { decimals, moneyCompact } from '@/lib/format';

const YEAR_TICKS = [1, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120];
const NARROW_TICKS = [1, 24, 48, 72, 96, 120];

const NARROW = '(max-width: 639px)';

/** Recharts dimensiona ejes y ticks en JS, así que el breakpoint tiene que llegar como dato. */
function useNarrow(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(NARROW);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}

interface Series {
  key: string;
  label: string;
  color: string;
  get: (m: MonthlyResult) => number;
  dashed?: boolean;
}

interface ChartProps {
  output: SimulationOutput;
  base: SimulationOutput;
  modified: boolean;
}

function SeriesChart({
  output,
  base,
  modified,
  series,
  baseline,
  format,
  zeroLine,
}: ChartProps & {
  series: Series[];
  /** Serie de la finca base que se dibuja punteada como referencia. */
  baseline?: Series;
  format: (n: number) => string;
  zeroLine?: boolean;
}) {
  const data = useMemo(() => {
    return output.months.map((m, i) => {
      const row: Record<string, number> = { month: m.month + 1 };
      for (const s of series) row[s.key] = s.get(m);
      const ref = base.months[i];
      if (baseline && ref) row.__base = baseline.get(ref);
      return row;
    });
  }, [output, base, series, baseline]);

  const narrow = useNarrow();

  return (
    <div className="h-56 w-full sm:h-72">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#f1f1f4" vertical={false} />
          <XAxis
            dataKey="month"
            ticks={narrow ? NARROW_TICKS : YEAR_TICKS}
            tick={{ fontSize: 11, fill: '#a1a1aa' }}
            tickLine={false}
            axisLine={{ stroke: '#e4e4e7' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#a1a1aa' }}
            tickLine={false}
            axisLine={false}
            width={narrow ? 44 : 56}
            tickFormatter={format}
          />
          {zeroLine ? <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" /> : null}
          <Tooltip
            formatter={(value) => format(Number(value))}
            labelFormatter={(m) => `Mes ${String(m)}`}
            contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e4e4e7' }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
          {modified && baseline ? (
            <Line
              type="monotone"
              dataKey="__base"
              name={`${baseline.label} (base)`}
              stroke="#a1a1aa"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          ) : null}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? '4 3' : undefined}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const CASH: Series[] = [
  { key: 'saldo', label: 'Saldo de caja', color: '#059669', get: (m) => m.cash.balance },
];

export const CashflowChart = (p: ChartProps) => (
  <SeriesChart {...p} series={CASH} baseline={CASH[0]} format={moneyCompact} zeroLine />
);

const HERD: Series[] = [
  { key: 'total', label: 'Hato total', color: '#0f766e', get: (m) => m.herd.total },
  { key: 'ordeno', label: 'Vacas en ordeño', color: '#059669', get: (m) => m.herd.cowsMilking },
  { key: 'levante', label: 'Hembras de levante', color: '#f59e0b', get: (m) => m.herd.heifersRearing },
];

export const HerdChart = (p: ChartProps) => (
  <SeriesChart {...p} series={HERD} baseline={HERD[0]} format={(n) => decimals(n, 0)} />
);

const EQUITY: Series[] = [
  { key: 'contable', label: 'Patrimonio contable', color: '#059669', get: (m) => m.balance.bookEquity },
  {
    key: 'liquidacion',
    label: 'Patrimonio de liquidación',
    color: '#7c3aed',
    get: (m) => m.balance.liquidationEquity,
  },
];

export const EquityChart = (p: ChartProps) => (
  <SeriesChart {...p} series={EQUITY} baseline={EQUITY[0]} format={moneyCompact} />
);

const MILK: Series[] = [
  { key: 'vendida', label: 'Litros vendidos', color: '#059669', get: (m) => m.milk.litersSold },
  { key: 'becerros', label: 'Litros a becerros', color: '#f59e0b', get: (m) => m.milk.litersToCalves },
];

export const MilkChart = (p: ChartProps) => (
  <SeriesChart {...p} series={MILK} baseline={MILK[0]} format={(n) => decimals(n, 0)} />
);

const FEED: Series[] = [
  { key: 'nbr', label: 'Balance nutricional (NBR)', color: '#059669', get: (m) => m.feed.nbr },
  { key: 'bcs', label: 'Condición corporal (÷5)', color: '#7c3aed', get: (m) => m.feed.bcs / 5 },
];

export const FeedChart = (p: ChartProps) => (
  <SeriesChart {...p} series={FEED} baseline={FEED[0]} format={(n) => decimals(n, 2)} />
);
