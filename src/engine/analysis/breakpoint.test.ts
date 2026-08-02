import { describe, expect, it } from 'vitest';
import { findBreakpoint } from './breakpoint';

describe('findBreakpoint', () => {
  it('encuentra la raíz de una función decreciente', () => {
    // Patrimonio que cae al subir el costo: cruza cero en 0.7.
    const hit = findBreakpoint({
      lo: 0.2,
      hi: 1.2,
      target: 0,
      evaluate: (x) => 700 - 1000 * x,
      tolerance: 1e-9,
      maxIterations: 40,
    });
    expect(hit).not.toBeNull();
    expect(hit?.value).toBeCloseTo(0.7, 8);
    expect(hit?.metric).toBeCloseTo(0, 5);
  });

  it('encuentra la raíz de una función creciente', () => {
    const hit = findBreakpoint({
      lo: 0,
      hi: 10,
      target: 25,
      evaluate: (x) => x * x,
      tolerance: 1e-6,
    });
    expect(hit?.value).toBeCloseTo(5, 5);
  });

  it('respeta un umbral distinto de cero', () => {
    const hit = findBreakpoint({
      lo: 0,
      hi: 100,
      target: 0.12,
      evaluate: (x) => x / 500,
      tolerance: 1e-6,
    });
    expect(hit?.value).toBeCloseTo(60, 4);
  });

  it('devuelve null si no hay cruce en el rango', () => {
    expect(
      findBreakpoint({ lo: 0, hi: 1, target: 0, evaluate: (x) => x + 5 }),
    ).toBeNull();
  });

  it('devuelve el extremo cuando la métrica ya está exactamente en el umbral', () => {
    const hit = findBreakpoint({ lo: 3, hi: 9, target: 0, evaluate: (x) => x - 3 });
    expect(hit?.value).toBe(3);
    expect(hit?.iterations).toBe(0);
  });

  it('converge dentro de la tolerancia pedida', () => {
    const hit = findBreakpoint({
      lo: 0,
      hi: 1024,
      target: 0,
      evaluate: (x) => x - 333,
      tolerance: 0.5,
      maxIterations: 40,
    });
    expect(Math.abs((hit?.value ?? 0) - 333)).toBeLessThanOrEqual(0.5);
    expect(hit?.iterations).toBeLessThanOrEqual(40);
  });

  it('no gasta más corridas de las permitidas', () => {
    let calls = 0;
    findBreakpoint({
      lo: 0,
      hi: 1,
      target: 0.5,
      evaluate: (x) => {
        calls++;
        return x;
      },
      tolerance: 0,
      maxIterations: 10,
    });
    // Dos evaluaciones de extremos más una por bisección.
    expect(calls).toBeLessThanOrEqual(12);
  });

  it('aborta sin romperse si la métrica deja de existir', () => {
    const hit = findBreakpoint({
      lo: 0,
      hi: 10,
      target: 5,
      evaluate: (x) => (x > 2 && x < 8 ? null : x),
    });
    expect(hit).not.toBeNull();
  });

  it('es determinista', () => {
    const run = () =>
      findBreakpoint({ lo: 0, hi: 3, target: 1, evaluate: (x) => Math.exp(x) - 1 })?.value;
    expect(run()).toBe(run());
  });
});
