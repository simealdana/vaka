/**
 * Generadores pseudoaleatorios sembrados. Nada aquí depende del reloj ni del entorno:
 * la misma semilla produce exactamente la misma secuencia en el hilo principal, en un
 * worker o en un test, que es lo que permite "reproducir el peor escenario".
 */

export type Rng = () => number;

/** Mezclador de 32 bits (splitmix32). Se usa para derivar semillas por iteración. */
export function hashSeed(base: number, index: number): number {
  let z = (base ^ 0x9e3779b9) + Math.imul(index + 1, 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

/** mulberry32: rápido, periodo 2^32, suficiente para muestreo de parámetros. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Inversa de la CDF triangular. Se muestrea por inversión (no por rechazo) para que
 * cada variable consuma exactamente un uniforme: así añadir una variable no desplaza
 * la secuencia de las demás y las corridas siguen siendo comparables.
 */
export function triangularFrom(u: number, min: number, mode: number, max: number): number {
  if (!(max > min)) return min;
  const m = Math.min(Math.max(mode, min), max);
  const split = (m - min) / (max - min);
  if (u <= split && split > 0) return min + Math.sqrt(u * (max - min) * (m - min));
  if (split >= 1) return max;
  return max - Math.sqrt((1 - u) * (max - min) * (max - m));
}

/**
 * Cuantil normal estándar (Acklam). Error absoluto < 1.15e-9, de sobra para muestreo.
 */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

  const plow = 0.02425;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - plow) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * Lognormal calibrada con el mismo lenguaje que el ganadero usa para la triangular:
 * la moda es la mediana y el rango min–max cubre ±2 desviaciones en escala log.
 * Se recorta al rango para que un precio no se dispare a diez veces el máximo declarado.
 */
export function lognormalFrom(u: number, min: number, mode: number, max: number): number {
  const median = Math.max(mode, 1e-9);
  const lo = Math.max(min, 1e-9);
  const hi = Math.max(max, median * 1.0001);
  const sigma = Math.max((Math.log(hi) - Math.log(lo)) / 4, 1e-6);
  const value = median * Math.exp(sigma * normalQuantile(u));
  return Math.min(Math.max(value, min), max);
}
