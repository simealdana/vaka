import type { SimulationSummary } from '@/engine/types';
import { decimals, money, pct } from '@/lib/format';

export interface MetricRow {
  key: string;
  label: string;
  get: (s: SimulationSummary) => number | null;
  format: (v: number | null) => string;
  /** Si más es mejor; `null` cuando la métrica es puramente descriptiva. */
  higherIsBetter: boolean | null;
}

const orDash = (fn: (v: number) => string) => (v: number | null) => (v === null ? '—' : fn(v));

export const METRIC_ROWS: MetricRow[] = [
  { key: 'bookEquity', label: 'Patrimonio contable a 10 años', get: (s) => s.finalBookEquity, format: orDash(money), higherIsBetter: true },
  { key: 'liqEquity', label: 'Patrimonio de liquidación', get: (s) => s.finalLiquidationEquity, format: orDash(money), higherIsBetter: true },
  {
    key: 'gap',
    label: 'Brecha liquidación − contable',
    get: (s) => s.finalLiquidationEquity - s.finalBookEquity,
    format: orDash(money),
    higherIsBetter: null,
  },
  { key: 'irr', label: 'TIR anual', get: (s) => s.irrAnnual, format: orDash((v) => pct(v, 1)), higherIsBetter: true },
  { key: 'npv', label: 'VAN', get: (s) => s.npv, format: orDash(money), higherIsBetter: true },
  { key: 'worstCash', label: 'Caja mínima', get: (s) => s.worstCashBalance, format: orDash(money), higherIsBetter: true },
  { key: 'worstMonth', label: 'Mes de la caja mínima', get: (s) => s.worstCashMonth + 1, format: orDash((v) => decimals(v, 0)), higherIsBetter: null },
  { key: 'capital', label: 'Capital requerido', get: (s) => s.maxCapitalRequired, format: orDash(money), higherIsBetter: false },
  { key: 'called', label: 'Capital efectivamente aportado', get: (s) => s.totalCapitalCalled, format: orDash(money), higherIsBetter: false },
  {
    key: 'breakeven',
    label: 'Mes de equilibrio operativo',
    get: (s) => (s.breakevenMonth === null ? null : s.breakevenMonth + 1),
    format: orDash((v) => decimals(v, 0)),
    higherIsBetter: false,
  },
  { key: 'insolvent', label: 'Meses insolventes', get: (s) => s.monthsInsolvent, format: orDash((v) => decimals(v, 0)), higherIsBetter: false },
  {
    key: 'firstInsolvent',
    label: 'Primer mes sin liquidez',
    get: (s) => (s.firstInsolventMonth === null ? null : s.firstInsolventMonth + 1),
    format: (v) => (v === null ? 'ninguno' : decimals(v, 0)),
    higherIsBetter: true,
  },
  { key: 'liters', label: 'Litros vendidos en 10 años', get: (s) => s.totalMilkLiters, format: orDash((v) => decimals(v, 0)), higherIsBetter: true },
  { key: 'cost', label: 'Costo por litro', get: (s) => s.avgCostPerLiter, format: orDash((v) => `$${v.toFixed(3)}`), higherIsBetter: false },
  { key: 'margin', label: 'Margen por litro', get: (s) => s.avgMarginPerLiter, format: orDash((v) => `$${v.toFixed(3)}`), higherIsBetter: true },
  { key: 'ebitda', label: 'EBITDA acumulado', get: (s) => s.cumulativeEbitda, format: orDash(money), higherIsBetter: true },
  { key: 'herd', label: 'Hato final', get: (s) => s.finalHerd, format: orDash((v) => decimals(v, 0)), higherIsBetter: true },
  { key: 'milking', label: 'Vacas en ordeño al final', get: (s) => s.finalCowsMilking, format: orDash((v) => decimals(v, 0)), higherIsBetter: true },
];
