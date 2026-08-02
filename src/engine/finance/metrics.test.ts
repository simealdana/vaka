import { describe, expect, it } from 'vitest';
import { annualizeMonthlyRate, irrMonthly, npv } from './metrics';

describe('npv', () => {
  it('coincide con el cálculo a mano de un flujo de tres periodos', () => {
    // -1000 + 600/1.1 + 600/1.21
    expect(npv(0.1, [-1000, 600, 600])).toBeCloseTo(41.3223140496, 8);
  });

  it('a tasa cero es la suma simple', () => {
    expect(npv(0, [-1000, 600, 600])).toBeCloseTo(200, 12);
  });
});

describe('irrMonthly', () => {
  it('resuelve la raíz de un flujo de tres periodos', () => {
    // 3x² + 3x − 5 = 0 con x = 1/(1+r)  →  r = 0.1306623...
    const r = irrMonthly([-1000, 600, 600])!;
    expect(r).toBeCloseTo(0.13066238629, 8);
    expect(npv(r, [-1000, 600, 600])).toBeCloseTo(0, 6);
  });

  it('devuelve null cuando el flujo nunca cambia de signo', () => {
    expect(irrMonthly([-100, -50, -20])).toBeNull();
    expect(irrMonthly([100, 50, 20])).toBeNull();
  });

  it('anualiza componiendo doce meses', () => {
    expect(annualizeMonthlyRate(0.01)).toBeCloseTo(Math.pow(1.01, 12) - 1, 12);
    expect(annualizeMonthlyRate(0)).toBe(0);
  });
});
