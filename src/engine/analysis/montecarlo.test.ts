import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../defaults';
import { setByPathCopying } from '../scenario/resolve';
import { simulate } from '../simulate';
import type { Assumptions } from '../types';
import {
  FAN_LEVELS,
  MC_METRICS,
  McRunner,
  PERCENTILE_LEVELS,
  type McVariable,
  percentile,
  reduceSlices,
  sampleIteration,
} from './montecarlo';

const VARIABLES: McVariable[] = [
  { path: 'channels.industryPricePerLiter', label: 'Precio industria', dist: 'triangular', min: 0.38, mode: 0.62, max: 0.82 },
  { path: 'milk.litersPerCowDay', label: 'Litros por vaca', dist: 'triangular', min: 6, mode: 8, max: 10 },
  { path: 'health.calfMortalityToWeaning', label: 'Mortalidad de becerras', dist: 'triangular', min: 0.04, mode: 0.06, max: 0.16 },
];

/** Horizonte corto: la corrida completa de 120 meses haría el test innecesariamente lento. */
const HORIZON = 12;

function makeRun() {
  return (sample: Float64Array) => {
    const base = { ...DEFAULT_ASSUMPTIONS, horizonMonths: HORIZON } as unknown as Record<string, unknown>;
    for (let i = 0; i < VARIABLES.length; i++) setByPathCopying(base, VARIABLES[i].path, sample[i]);
    return simulate(base as unknown as Assumptions);
  };
}

function runSlice(from: number, to: number, seed = 4242) {
  const runner = new McRunner({
    variables: VARIABLES,
    seed,
    from,
    to,
    horizonMonths: HORIZON,
    run: makeRun(),
  });
  while (!runner.step(7)) {
    /* avanza por chunks, igual que el worker */
  }
  return runner.result();
}

describe('sampleIteration', () => {
  it('la misma semilla e iteración dan los mismos valores', () => {
    const a = sampleIteration(VARIABLES, 7, 100, new Float64Array(3));
    const b = sampleIteration(VARIABLES, 7, 100, new Float64Array(3));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('iteraciones distintas dan valores distintos', () => {
    const a = sampleIteration(VARIABLES, 7, 100, new Float64Array(3));
    const b = sampleIteration(VARIABLES, 7, 101, new Float64Array(3));
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('cada valor cae dentro del rango declarado', () => {
    const out = new Float64Array(3);
    for (let i = 0; i < 500; i++) {
      sampleIteration(VARIABLES, 1, i, out);
      for (let k = 0; k < VARIABLES.length; k++) {
        expect(out[k]).toBeGreaterThanOrEqual(VARIABLES[k].min);
        expect(out[k]).toBeLessThanOrEqual(VARIABLES[k].max);
      }
    }
  });
});

describe('percentile', () => {
  const sorted = Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  it('interpola linealmente entre los datos', () => {
    expect(percentile(sorted, 0)).toBe(1);
    expect(percentile(sorted, 1)).toBe(10);
    expect(percentile(sorted, 0.5)).toBeCloseTo(5.5, 9);
    expect(percentile(sorted, 0.25)).toBeCloseTo(3.25, 9);
  });

  it('aguanta arrays de un solo valor o vacíos', () => {
    expect(percentile(Float64Array.from([42]), 0.9)).toBe(42);
    expect(Number.isNaN(percentile(new Float64Array(0), 0.5))).toBe(true);
  });

  it('es monótona en el nivel pedido', () => {
    let previous = -Infinity;
    for (const p of PERCENTILE_LEVELS) {
      const value = percentile(sorted, p);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('McRunner y reduceSlices', () => {
  it('la corrida es reproducible con la misma semilla', () => {
    const a = runSlice(0, 24);
    const b = runSlice(0, 24);
    expect(Array.from(a.metrics[0])).toEqual(Array.from(b.metrics[0]));
    expect(a.worstIteration).toBe(b.worstIteration);
  });

  it('repartir las iteraciones en tramos no cambia el resultado', () => {
    const whole = reduceSlices([runSlice(0, 24)], { seed: 4242, variables: VARIABLES, elapsedMs: 0 });
    const split = reduceSlices(
      // En desorden a propósito: el reductor los ordena por índice antes de mezclar.
      [runSlice(16, 24), runSlice(0, 8), runSlice(8, 16)],
      { seed: 4242, variables: VARIABLES, elapsedMs: 0 },
    );

    expect(split.iterations).toBe(whole.iterations);
    for (let k = 0; k < MC_METRICS.length; k++) {
      expect(Array.from(split.metrics[k].percentiles)).toEqual(
        Array.from(whole.metrics[k].percentiles),
      );
    }
    expect(Array.from(split.fan[0].bands)).toEqual(Array.from(whole.fan[0].bands));
    expect(split.probInsolvency).toBe(whole.probInsolvency);
    expect(split.worstIteration).toBe(whole.worstIteration);
  });

  it('los percentiles salen ordenados y dentro del rango observado', () => {
    const result = reduceSlices([runSlice(0, 24)], { seed: 4242, variables: VARIABLES, elapsedMs: 0 });
    for (const metric of result.metrics) {
      if (metric.count === 0) continue;
      let previous = -Infinity;
      for (const p of metric.percentiles) {
        expect(p).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = p;
      }
      expect(metric.percentiles[0]).toBeGreaterThanOrEqual(metric.min - 1e-9);
      expect(metric.percentiles[metric.percentiles.length - 1]).toBeLessThanOrEqual(metric.max + 1e-9);
      expect(metric.mean).toBeGreaterThanOrEqual(metric.min - 1e-9);
      expect(metric.mean).toBeLessThanOrEqual(metric.max + 1e-9);
    }
  });

  it('el histograma reparte todas las observaciones', () => {
    const result = reduceSlices([runSlice(0, 24)], { seed: 4242, variables: VARIABLES, elapsedMs: 0 });
    const equity = result.metrics[0];
    const total = equity.histogram.counts.reduce((t, c) => t + c, 0);
    expect(total).toBe(equity.count);
  });

  it('las bandas del fan chart no se cruzan', () => {
    const result = reduceSlices([runSlice(0, 24)], { seed: 4242, variables: VARIABLES, elapsedMs: 0 });
    for (const series of result.fan) {
      expect(series.horizon).toBe(HORIZON);
      for (let m = 0; m < series.horizon; m++) {
        for (let l = 1; l < FAN_LEVELS.length; l++) {
          expect(series.bands[l * series.horizon + m]).toBeGreaterThanOrEqual(
            series.bands[(l - 1) * series.horizon + m] - 1e-9,
          );
        }
      }
    }
  });

  it('la mediana del patrimonio se parece a la corrida con los supuestos base', () => {
    const result = reduceSlices([runSlice(0, 32)], { seed: 4242, variables: VARIABLES, elapsedMs: 0 });
    const median = result.metrics[0].percentiles[PERCENTILE_LEVELS.indexOf(0.5)];
    const central = makeRun()(Float64Array.from(VARIABLES.map((v) => v.mode))).summary.finalBookEquity;
    expect(Math.abs(median - central) / Math.abs(central)).toBeLessThan(0.25);
  });
});
