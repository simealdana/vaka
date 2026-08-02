/**
 * Curva de lactancia tipo Wood: y(t) = t^b · e^(-c·t).
 * b/c = 1.375 meses al pico, adecuado para mestizos cebú de doble propósito
 * (pico temprano y curva más plana que una Holstein especializada).
 */
const WOOD_B = 0.22;
const WOOD_C = 0.16;

const shapeCache = new Map<number, Float64Array>();

/** Multiplicadores por mes de lactancia, normalizados a media 1 sobre la lactancia completa. */
export function lactationShape(lactationMonths: number): Float64Array {
  const n = Math.max(1, Math.min(24, Math.round(lactationMonths)));
  const cached = shapeCache.get(n);
  if (cached) return cached;

  const raw = new Float64Array(n);
  let total = 0;
  for (let m = 0; m < n; m++) {
    const t = m + 0.5;
    raw[m] = Math.pow(t, WOOD_B) * Math.exp(-WOOD_C * t);
    total += raw[m];
  }
  const mean = total / n;
  for (let m = 0; m < n; m++) raw[m] /= mean;

  shapeCache.set(n, raw);
  return raw;
}

/** Factor de producción por número de parto; el índice 0 es la primera lactancia. */
export function parityFactor(factors: number[], parityBucket: number): number {
  const i = Math.min(parityBucket, factors.length) - 1;
  return factors[Math.max(0, i)] ?? 1;
}
