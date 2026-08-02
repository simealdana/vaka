/** Valor presente neto de un flujo mensual, descontado a una tasa mensual. */
export function npv(monthlyRate: number, flows: number[]): number {
  let total = 0;
  for (let t = 0; t < flows.length; t++) total += flows[t] / Math.pow(1 + monthlyRate, t);
  return total;
}

/**
 * TIR mensual por bisección. Devuelve null cuando el flujo no cambia de signo,
 * que es el caso en que la TIR no está definida.
 */
export function irrMonthly(flows: number[]): number | null {
  let hasPositive = false;
  let hasNegative = false;
  for (const f of flows) {
    if (f > 0) hasPositive = true;
    if (f < 0) hasNegative = true;
  }
  if (!hasPositive || !hasNegative) return null;

  let lo = -0.9;
  let hi = 1.0;
  let fLo = npv(lo, flows);
  if (fLo * npv(hi, flows) > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, flows);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid <= 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

export const annualizeMonthlyRate = (monthly: number): number => Math.pow(1 + monthly, 12) - 1;
