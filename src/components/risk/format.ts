import type { McMetric } from '@/engine/analysis/montecarlo';
import type { VariableSpec } from '@/lib/assumptions/schema';
import { VARIABLES_BY_PATH } from '@/lib/assumptions/schema';
import { decimals, formatValue, money, moneyCompact, pct } from '@/lib/format';

export type MetricFormat = McMetric['format'];

/** Formato largo, para tablas y tooltips. */
export function formatMetric(value: number, format: MetricFormat): string {
  if (!Number.isFinite(value)) return '—';
  switch (format) {
    case 'money':
      return money(value);
    case 'pct':
      return pct(value, 1);
    case 'rate':
      return `$${value.toFixed(3)}`;
    default:
      return decimals(value, 0);
  }
}

/** Formato corto, para ejes donde el espacio manda. */
export function formatMetricAxis(value: number, format: MetricFormat): string {
  if (!Number.isFinite(value)) return '';
  switch (format) {
    case 'money':
      return moneyCompact(value);
    case 'pct':
      return pct(value, 0);
    case 'rate':
      return `$${value.toFixed(2)}`;
    default:
      return decimals(value, 0);
  }
}

export const specFor = (path: string): VariableSpec | undefined => VARIABLES_BY_PATH.get(path);

/** Valor de una variable con las unidades de su ficha (porcentajes en 0-100, etc.). */
export function formatVariable(path: string, value: number): string {
  const spec = specFor(path);
  return spec ? formatValue(value, spec) : decimals(value, 2);
}
