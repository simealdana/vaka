import type { VariableSpec } from '@/lib/assumptions/schema';

const LOCALE = 'es-VE';

const num = (digits: number) =>
  new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const fmt0 = num(0);
const fmt1 = num(1);
const fmt2 = num(2);

export const money = (n: number): string =>
  `${n < 0 ? '−' : ''}$${fmt0.format(Math.abs(Math.round(n)))}`;

export function moneyCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}$${fmt1.format(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${fmt0.format(abs / 1_000)}k`;
  return `${sign}$${fmt0.format(abs)}`;
}

export const pct = (fraction: number, digits = 0): string =>
  `${num(digits).format(fraction * 100)}%`;

export const signedPct = (fraction: number, digits = 0): string =>
  `${fraction > 0 ? '+' : fraction < 0 ? '−' : ''}${num(digits).format(Math.abs(fraction) * 100)}%`;

export const decimals = (n: number, digits = 1): string => num(digits).format(n);

/** Valor de una variable tal como se teclea: los porcentajes se editan en 0-100, no en 0-1. */
export const toDisplay = (value: number, spec: VariableSpec): number =>
  spec.kind === 'percent' ? value * 100 : value;

export const fromDisplay = (shown: number, spec: VariableSpec): number =>
  spec.kind === 'percent' ? shown / 100 : shown;

export function formatValue(value: number, spec: VariableSpec): string {
  switch (spec.kind) {
    case 'boolean':
      return value === 1 ? 'Sí' : 'No';
    case 'percent':
      return pct(value, spec.step < 0.01 ? 1 : 0);
    case 'integer':
      return fmt0.format(value);
    case 'money':
      return value >= 1000 ? money(value) : `$${fmt2.format(value)}`;
    default:
      return Math.abs(value) >= 100 ? fmt0.format(value) : fmt2.format(value);
  }
}

const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
];

export function relativeTime(timestamp: number): string {
  let amount = (timestamp - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(amount) < size) return relative.format(Math.round(amount), unit);
    amount /= size;
  }
  return relative.format(Math.round(amount), 'year');
}

export const monthLabel = (month: number): string =>
  `A${Math.floor(month / 12) + 1} M${(month % 12) + 1}`;
