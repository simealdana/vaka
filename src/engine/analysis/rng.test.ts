import { describe, expect, it } from 'vitest';
import { hashSeed, lognormalFrom, mulberry32, normalQuantile, triangularFrom } from './rng';

const draw = (rng: () => number, n: number) => Array.from({ length: n }, () => rng());

describe('mulberry32', () => {
  it('la misma semilla produce exactamente la misma secuencia', () => {
    expect(draw(mulberry32(12345), 20)).toEqual(draw(mulberry32(12345), 20));
  });

  it('semillas distintas divergen', () => {
    expect(draw(mulberry32(1), 10)).not.toEqual(draw(mulberry32(2), 10));
  });

  it('se mantiene dentro de [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 5000; i++) {
      const u = rng();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  it('la media de 20.000 muestras se acerca a 0.5', () => {
    const rng = mulberry32(99);
    let sum = 0;
    for (let i = 0; i < 20000; i++) sum += rng();
    expect(sum / 20000).toBeCloseTo(0.5, 2);
  });
});

describe('hashSeed', () => {
  it('es determinista y depende del índice', () => {
    expect(hashSeed(42, 7)).toBe(hashSeed(42, 7));
    expect(hashSeed(42, 7)).not.toBe(hashSeed(42, 8));
    expect(hashSeed(42, 7)).not.toBe(hashSeed(43, 7));
  });

  it('devuelve enteros de 32 bits sin signo', () => {
    for (let i = 0; i < 200; i++) {
      const s = hashSeed(1234, i);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2 ** 32);
    }
  });

  it('índices consecutivos no producen secuencias correlacionadas', () => {
    const a = draw(mulberry32(hashSeed(5, 100)), 5);
    const b = draw(mulberry32(hashSeed(5, 101)), 5);
    expect(a).not.toEqual(b);
  });
});

describe('triangularFrom', () => {
  const min = 0.35;
  const mode = 0.65;
  const max = 0.85;

  it('respeta los extremos', () => {
    expect(triangularFrom(0, min, mode, max)).toBeCloseTo(min, 9);
    expect(triangularFrom(1, min, mode, max)).toBeCloseTo(max, 9);
  });

  it('es monótona creciente en el uniforme', () => {
    let previous = -Infinity;
    for (let u = 0; u <= 1.0001; u += 0.01) {
      const x = triangularFrom(Math.min(u, 1), min, mode, max);
      expect(x).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = x;
    }
  });

  it('la media muestral coincide con (min+moda+max)/3', () => {
    const rng = mulberry32(2024);
    let sum = 0;
    const n = 40000;
    for (let i = 0; i < n; i++) sum += triangularFrom(rng(), min, mode, max);
    expect(sum / n).toBeCloseTo((min + mode + max) / 3, 2);
  });

  it('la mediana cae donde manda la CDF', () => {
    // Con moda a la derecha del centro, F(mode) = (mode-min)/(max-min) > 0.5,
    // así que la mediana está por debajo de la moda.
    const median = triangularFrom(0.5, min, mode, max);
    expect(median).toBeGreaterThan(min);
    expect(median).toBeLessThan(mode);
  });

  it('un rango degenerado devuelve el propio valor', () => {
    expect(triangularFrom(0.4, 3, 3, 3)).toBe(3);
  });
});

describe('normalQuantile y lognormalFrom', () => {
  it('la normal estándar es simétrica y conocida', () => {
    expect(normalQuantile(0.5)).toBeCloseTo(0, 6);
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 4);
    expect(normalQuantile(0.025)).toBeCloseTo(-1.959964, 4);
  });

  it('la lognormal queda recortada al rango declarado', () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 5000; i++) {
      const x = lognormalFrom(rng(), 0.4, 0.52, 0.85);
      expect(x).toBeGreaterThanOrEqual(0.4);
      expect(x).toBeLessThanOrEqual(0.85);
    }
  });

  it('el uniforme central devuelve la moda', () => {
    expect(lognormalFrom(0.5, 0.4, 0.52, 0.85)).toBeCloseTo(0.52, 6);
  });
});
