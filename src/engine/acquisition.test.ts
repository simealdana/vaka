import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from './defaults';
import { simulate } from './simulate';
import type { Acquisition, Assumptions } from './types';

const withAcquisition = (patch: Partial<Acquisition>, capital: Partial<Assumptions['capital']> = {}) =>
  simulate({
    ...DEFAULT_ASSUMPTIONS,
    acquisition: { ...DEFAULT_ASSUMPTIONS.acquisition, ...patch },
    capital: { ...DEFAULT_ASSUMPTIONS.capital, ...capital },
  });

const PURCHASE: Partial<Acquisition> = {
  isPurchase: true,
  landCost: 150000,
  herdCost: 90000,
  infrastructureCost: 80000,
  closingCost: 5000,
};

describe('adquisición', () => {
  it('la finca ya poseída no reporta costo de adquisición', () => {
    const s = withAcquisition({ isPurchase: false }).summary;
    expect(s.acquisitionCost).toBe(0);
    expect(s.entryGain).toBe(0);
  });

  it('comprando, la inversión inicial es lo pagado más la caja menos la deuda', () => {
    const s = withAcquisition(PURCHASE).summary;
    expect(s.acquisitionCost).toBe(325000);
    expect(s.initialInvestment).toBe(325000 + DEFAULT_ASSUMPTIONS.capital.initialCash);
  });

  it('el préstamo reduce el desembolso propio y apalanca la TIR', () => {
    const sinDeuda = withAcquisition(PURCHASE).summary;
    const conDeuda = withAcquisition(PURCHASE, { debtPrincipal: 100000 }).summary;
    expect(conDeuda.initialInvestment).toBe(sinDeuda.initialInvestment - 100000);
    expect(conDeuda.irrAnnual).not.toBeNull();
    expect(conDeuda.irrAnnual!).toBeGreaterThan(sinDeuda.irrAnnual!);
  });

  it('comprar por debajo del mercado deja plusvalía de entrada', () => {
    const caro = withAcquisition({ ...PURCHASE, landCost: 300000 }).summary;
    const barato = withAcquisition({ ...PURCHASE, landCost: 60000 }).summary;
    expect(barato.entryGain).toBeGreaterThan(0);
    expect(caro.entryGain).toBeLessThan(0);
    // Los activos son los mismos: la diferencia de plusvalía es exactamente el sobreprecio.
    expect(caro.entryGain).toBeCloseTo(barato.entryGain - 240000, 6);
  });

  it('pagar de más hunde la TIR sin tocar la operación', () => {
    const caro = withAcquisition({ ...PURCHASE, landCost: 300000 });
    const barato = withAcquisition({ ...PURCHASE, landCost: 60000 });
    expect(caro.summary.irrAnnual!).toBeLessThan(barato.summary.irrAnnual!);
    expect(caro.summary.cumulativeEbitda).toBeCloseTo(barato.summary.cumulativeEbitda, 6);
  });

  it('el capital total requerido suma el desembolso inicial y los aportes posteriores', () => {
    const s = withAcquisition(PURCHASE).summary;
    expect(s.totalCapitalRequired).toBeCloseTo(s.initialInvestment + s.maxCapitalRequired, 6);
  });
});
