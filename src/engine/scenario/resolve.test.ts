import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../defaults';
import { assumptionsAt, overrideWeight, resolveTimelines } from './resolve';
import type { ScenarioOverride } from '../types';

const override = (o: Partial<ScenarioOverride>): ScenarioOverride => ({
  id: 'o',
  label: 'test',
  target: 'milk.priceIndex',
  op: 'multiply',
  value: 0.8,
  startMonth: 0,
  durationMonths: Number.POSITIVE_INFINITY,
  ...o,
});

describe('overrideWeight', () => {
  it('vale 0 antes del inicio y 1 durante un evento permanente', () => {
    const o = override({ startMonth: 5 });
    expect(overrideWeight(o, 4)).toBe(0);
    expect(overrideWeight(o, 5)).toBe(1);
    expect(overrideWeight(o, 500)).toBe(1);
  });

  it('sube linealmente durante la rampa de entrada', () => {
    const o = override({ startMonth: 0, rampInMonths: 4 });
    expect([0, 1, 2, 3, 4].map((m) => overrideWeight(o, m))).toEqual([0.25, 0.5, 0.75, 1, 1]);
  });

  it('decae linealmente durante la recuperación y vuelve a cero', () => {
    const o = override({
      startMonth: 14,
      durationMonths: 9,
      recovery: { type: 'linear', months: 6 },
    });
    expect(overrideWeight(o, 13)).toBe(0);
    expect(overrideWeight(o, 22)).toBe(1);
    expect(overrideWeight(o, 24)).toBeCloseTo(5 / 6, 10);
    expect(overrideWeight(o, 28)).toBeCloseTo(1 / 6, 10);
    expect(overrideWeight(o, 29)).toBe(0);
  });

  it('corta de golpe cuando la recuperación es inmediata', () => {
    const o = override({ startMonth: 2, durationMonths: 3 });
    expect(overrideWeight(o, 4)).toBe(1);
    expect(overrideWeight(o, 5)).toBe(0);
  });

  it('reaparece en cada repetición y no más veces de las indicadas', () => {
    const o = override({
      startMonth: 0,
      durationMonths: 2,
      repeat: { everyMonths: 12, times: 3 },
    });
    expect([0, 1, 2, 12, 13, 14, 24, 25, 36].map((m) => overrideWeight(o, m))).toEqual([
      1, 1, 0, 1, 1, 0, 1, 1, 0,
    ]);
  });
});

describe('resolveTimelines', () => {
  it('produce la serie exacta de un multiply con recuperación lineal', () => {
    const base = 0.62;
    const a = { ...DEFAULT_ASSUMPTIONS };
    a.channels = { ...a.channels, industryPricePerLiter: base };

    const timelines = resolveTimelines(
      a,
      [
        override({
          target: 'channels.industryPricePerLiter',
          op: 'multiply',
          value: 0.8,
          startMonth: 14,
          durationMonths: 9,
          recovery: { type: 'linear', months: 6 },
        }),
      ],
      36,
    );

    const series = timelines.get('channels.industryPricePerLiter')!;
    expect(series[13]).toBeCloseTo(base, 12);
    expect(series[14]).toBeCloseTo(base * 0.8, 12);
    expect(series[22]).toBeCloseTo(base * 0.8, 12);
    expect(series[24]).toBeCloseTo(base * (1 - 0.2 * (5 / 6)), 12);
    expect(series[29]).toBeCloseTo(base, 12);
  });

  it('compone multiply por producto y aplica add al final', () => {
    const timelines = resolveTimelines(
      DEFAULT_ASSUMPTIONS,
      [
        override({ id: 'a', target: 'milk.litersPerCowDay', op: 'multiply', value: 0.5 }),
        override({ id: 'b', target: 'milk.litersPerCowDay', op: 'multiply', value: 0.5 }),
        override({ id: 'c', target: 'milk.litersPerCowDay', op: 'add', value: 1, priority: 10 }),
      ],
      3,
    );
    const base = DEFAULT_ASSUMPTIONS.milk.litersPerCowDay;
    expect(timelines.get('milk.litersPerCowDay')![0]).toBeCloseTo(base * 0.25 + 1, 12);
  });

  it('el override de mayor prioridad gana con set', () => {
    const timelines = resolveTimelines(
      DEFAULT_ASSUMPTIONS,
      [
        override({ id: 'a', target: 'milk.litersPerCowDay', op: 'set', value: 4, priority: 1 }),
        override({ id: 'b', target: 'milk.litersPerCowDay', op: 'set', value: 6, priority: 2 }),
      ],
      3,
    );
    expect(timelines.get('milk.litersPerCowDay')![0]).toBeCloseTo(6, 12);
  });

  it('assumptionsAt no muta la base ni copia ramas ajenas', () => {
    const timelines = resolveTimelines(
      DEFAULT_ASSUMPTIONS,
      [override({ target: 'milk.litersPerCowDay', op: 'set', value: 3 })],
      3,
    );
    const at = assumptionsAt(DEFAULT_ASSUMPTIONS, timelines, 0);
    expect(at.milk.litersPerCowDay).toBe(3);
    expect(DEFAULT_ASSUMPTIONS.milk.litersPerCowDay).not.toBe(3);
    expect(at.feed).toBe(DEFAULT_ASSUMPTIONS.feed);
  });

  it('sin overrides devuelve el mismo objeto base', () => {
    const timelines = resolveTimelines(DEFAULT_ASSUMPTIONS, [], 12);
    expect(assumptionsAt(DEFAULT_ASSUMPTIONS, timelines, 5)).toBe(DEFAULT_ASSUMPTIONS);
  });
});
