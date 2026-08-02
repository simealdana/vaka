/**
 * Bisección sobre una métrica monótona: "¿hasta dónde puede moverse esta variable
 * antes de que la finca deje de ser viable?". Es el punto de quiebre del tornado y
 * también sirve para resolver preguntas del tipo "¿a qué precio de leche pierdo plata?".
 */

export interface BisectOptions {
  /** Extremo del rango donde se evalúa primero. */
  lo: number;
  hi: number;
  /** Valor de la métrica que marca el quiebre (0 para "se queda sin caja"). */
  target: number;
  /** Devuelve la métrica para un valor de la variable; `null` = no evaluable. */
  evaluate: (x: number) => number | null;
  /** Ancho aceptable del intervalo final, en unidades de la variable. */
  tolerance?: number;
  maxIterations?: number;
}

export interface BisectResult {
  /** Valor de la variable en el cruce. */
  value: number;
  /** Métrica en ese valor: debería quedar pegada a `target`. */
  metric: number;
  iterations: number;
  /** `true` si la métrica ya estaba del lado malo en `lo`. */
  crossedAtLow: boolean;
}

/**
 * Devuelve el cruce si la métrica cambia de lado entre `lo` y `hi`; `null` si no hay
 * cruce en el rango (la finca aguanta todo el rango, o ya está quebrada en ambos extremos).
 * No exige monotonía global: si la hay, el resultado es el único cruce.
 */
export function findBreakpoint(options: BisectOptions): BisectResult | null {
  const { lo, hi, target, evaluate } = options;
  const tolerance = options.tolerance ?? Math.abs(hi - lo) / 1000;
  const maxIterations = options.maxIterations ?? 24;

  const fLo = evaluate(lo);
  const fHi = evaluate(hi);
  if (fLo === null || fHi === null) return null;

  const sLo = Math.sign(fLo - target);
  const sHi = Math.sign(fHi - target);
  if (sLo === 0) return { value: lo, metric: fLo, iterations: 0, crossedAtLow: true };
  if (sHi === 0) return { value: hi, metric: fHi, iterations: 0, crossedAtLow: false };
  if (sLo === sHi) return null;

  let a = lo;
  let b = hi;
  let fa = fLo;
  let mid = (a + b) / 2;
  let fMid = fa;
  let iterations = 0;

  while (iterations < maxIterations && Math.abs(b - a) > tolerance) {
    iterations++;
    mid = (a + b) / 2;
    const value = evaluate(mid);
    if (value === null) break;
    fMid = value;
    if (Math.sign(fMid - target) === Math.sign(fa - target)) {
      a = mid;
      fa = fMid;
    } else {
      b = mid;
    }
  }

  return { value: mid, metric: fMid, iterations, crossedAtLow: sLo < 0 };
}
