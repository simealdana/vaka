import type { MonthlyResult, ParamPath, SimulationOutput, SimulationSummary } from '../types';
import { hashSeed, lognormalFrom, mulberry32, triangularFrom } from './rng';

/** Rango declarado por el usuario para una variable incierta. */
export interface McVariable {
  path: ParamPath;
  label: string;
  dist: 'triangular' | 'lognormal';
  min: number;
  mode: number;
  max: number;
}

export interface McMetric {
  key: string;
  label: string;
  format: 'money' | 'pct' | 'rate' | 'count';
  /** Más alto es mejor. `null` cuando la métrica es descriptiva. */
  higherIsBetter: boolean | null;
  get: (s: SimulationSummary) => number | null;
}

/** Escalares que se guardan por iteración. Todo lo demás se descarta al terminar la corrida. */
export const MC_METRICS: McMetric[] = [
  { key: 'bookEquity', label: 'Patrimonio contable a 10 años', format: 'money', higherIsBetter: true, get: (s) => s.finalBookEquity },
  { key: 'liqEquity', label: 'Patrimonio de liquidación', format: 'money', higherIsBetter: true, get: (s) => s.finalLiquidationEquity },
  { key: 'irr', label: 'TIR anual', format: 'pct', higherIsBetter: true, get: (s) => s.irrAnnual },
  { key: 'npv', label: 'VAN', format: 'money', higherIsBetter: true, get: (s) => s.npv },
  { key: 'worstCash', label: 'Caja mínima', format: 'money', higherIsBetter: true, get: (s) => s.worstCashBalance },
  { key: 'capital', label: 'Capital requerido', format: 'money', higherIsBetter: false, get: (s) => s.maxCapitalRequired },
  { key: 'ebitda', label: 'EBITDA acumulado', format: 'money', higherIsBetter: true, get: (s) => s.cumulativeEbitda },
  { key: 'margin', label: 'Margen por litro', format: 'rate', higherIsBetter: true, get: (s) => s.avgMarginPerLiter },
  { key: 'insolvent', label: 'Meses sin liquidez', format: 'count', higherIsBetter: false, get: (s) => s.monthsInsolvent },
];

export interface McFanSeries {
  key: string;
  label: string;
  format: 'money' | 'count';
  get: (m: MonthlyResult) => number;
}

/** Series mensuales cuyas bandas de incertidumbre se dibujan en el fan chart. */
export const MC_FAN_SERIES: McFanSeries[] = [
  { key: 'cash', label: 'Saldo de caja', format: 'money', get: (m) => m.cash.balance },
  { key: 'equity', label: 'Patrimonio contable', format: 'money', get: (m) => m.balance.bookEquity },
  { key: 'herd', label: 'Hato total', format: 'count', get: (m) => m.herd.total },
];

/** Cuantiles reportados en la tabla de percentiles, en el mismo orden que los arrays. */
export const PERCENTILE_LEVELS = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95] as const;
/** Bandas del fan chart: P10, P25, P50, P75, P90. */
export const FAN_LEVELS = [0.1, 0.25, 0.5, 0.75, 0.9] as const;

export const HISTOGRAM_BINS = 36;

/** Valores muestreados de cada variable para una iteración. */
export function sampleIteration(
  variables: McVariable[],
  seed: number,
  iteration: number,
  out: Float64Array,
): Float64Array {
  const rng = mulberry32(hashSeed(seed, iteration));
  for (let i = 0; i < variables.length; i++) {
    const v = variables[i];
    const u = rng();
    out[i] = v.dist === 'lognormal'
      ? lognormalFrom(u, v.min, v.mode, v.max)
      : triangularFrom(u, v.min, v.mode, v.max);
  }
  return out;
}

/**
 * Resultado crudo de un tramo de iteraciones. Contiene escalares por iteración y las
 * series mensuales en `Float32Array`, nunca `SimulationOutput` completos: para 5.000
 * iteraciones son ~8 MB de buffers transferibles en vez de cientos de MB de objetos.
 */
export interface McSlice {
  from: number;
  to: number;
  count: number;
  horizon: number;
  /** Un array por métrica de `MC_METRICS`, con `NaN` donde la métrica no existe (TIR sin cruce). */
  metrics: Float64Array[];
  /** Un array por serie de `MC_FAN_SERIES`, de tamaño `count * horizon`. */
  fan: Float32Array[];
  insolventCount: number;
  /** Iteración con el peor patrimonio contable del tramo: sirve para reproducirla. */
  worstIteration: number;
  worstEquity: number;
  worstSample: Float64Array;
}

export interface McRunOptions {
  variables: McVariable[];
  seed: number;
  /** Tramo de iteraciones globales `[from, to)`. El índice global fija la semilla. */
  from: number;
  to: number;
  horizonMonths: number;
  /** Corre el motor con los valores muestreados. Lo inyecta quien conozca el `EditMap`. */
  run: (sample: Float64Array) => SimulationOutput;
}

/**
 * Corrida por tramos: `step()` avanza un número acotado de iteraciones y devuelve el
 * control, para que el worker pueda atender un CANCEL y reportar progreso entre chunks.
 */
export class McRunner {
  private readonly options: McRunOptions;
  private readonly sample: Float64Array;
  private readonly slice: McSlice;
  private cursor: number;

  constructor(options: McRunOptions) {
    this.options = options;
    const count = Math.max(0, options.to - options.from);
    const horizon = options.horizonMonths;
    this.sample = new Float64Array(options.variables.length);
    this.cursor = options.from;
    this.slice = {
      from: options.from,
      to: options.to,
      count,
      horizon,
      metrics: MC_METRICS.map(() => new Float64Array(count)),
      fan: MC_FAN_SERIES.map(() => new Float32Array(count * horizon)),
      insolventCount: 0,
      worstIteration: options.from,
      worstEquity: Number.POSITIVE_INFINITY,
      worstSample: new Float64Array(options.variables.length),
    };
  }

  get done(): number {
    return this.cursor - this.options.from;
  }

  get total(): number {
    return this.slice.count;
  }

  get finished(): boolean {
    return this.cursor >= this.options.to;
  }

  /** Avanza como mucho `chunk` iteraciones. Devuelve `true` cuando ya no queda nada. */
  step(chunk: number): boolean {
    const { variables, seed, run, to, horizonMonths } = this.options;
    const end = Math.min(to, this.cursor + chunk);

    for (; this.cursor < end; this.cursor++) {
      const i = this.cursor - this.options.from;
      sampleIteration(variables, seed, this.cursor, this.sample);
      const output = run(this.sample);
      const summary = output.summary;

      for (let k = 0; k < MC_METRICS.length; k++) {
        const value = MC_METRICS[k].get(summary);
        this.slice.metrics[k][i] = value === null || !Number.isFinite(value) ? NaN : value;
      }

      const months = output.months;
      for (let s = 0; s < MC_FAN_SERIES.length; s++) {
        const get = MC_FAN_SERIES[s].get;
        const buffer = this.slice.fan[s];
        const base = i * horizonMonths;
        for (let m = 0; m < horizonMonths; m++) {
          buffer[base + m] = m < months.length ? get(months[m]) : NaN;
        }
      }

      if (summary.monthsInsolvent > 0) this.slice.insolventCount++;
      if (summary.finalBookEquity < this.slice.worstEquity) {
        this.slice.worstEquity = summary.finalBookEquity;
        this.slice.worstIteration = this.cursor;
        this.slice.worstSample.set(this.sample);
      }
    }

    return this.finished;
  }

  result(): McSlice {
    if (!Number.isFinite(this.slice.worstEquity)) this.slice.worstEquity = 0;
    return this.slice;
  }
}

/** Percentil por interpolación lineal sobre un array ya ordenado. */
export function percentile(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const pos = (n - 1) * Math.min(Math.max(p, 0), 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface McHistogram {
  /** Conteo por bin. */
  counts: Float64Array;
  min: number;
  max: number;
  binWidth: number;
}

export interface McMetricResult {
  key: string;
  label: string;
  format: McMetric['format'];
  higherIsBetter: boolean | null;
  /** Iteraciones en que la métrica existió (la TIR no siempre tiene solución). */
  count: number;
  mean: number;
  stdev: number;
  min: number;
  max: number;
  /** Un valor por nivel de `PERCENTILE_LEVELS`. */
  percentiles: Float64Array;
  histogram: McHistogram;
  /** Fracción de iteraciones con valor negativo: probabilidad de perder. */
  shareNegative: number;
}

export interface McFanResult {
  key: string;
  label: string;
  format: McFanSeries['format'];
  horizon: number;
  /** `FAN_LEVELS.length * horizon` valores, banda mayor primero por índice de nivel. */
  bands: Float64Array;
}

export interface McResult {
  iterations: number;
  seed: number;
  horizon: number;
  variables: McVariable[];
  metrics: McMetricResult[];
  fan: McFanResult[];
  probInsolvency: number;
  probEquityLoss: number;
  worstIteration: number;
  worstEquity: number;
  worstSample: Float64Array;
  elapsedMs: number;
}

function histogram(sorted: Float64Array): McHistogram {
  const counts = new Float64Array(HISTOGRAM_BINS);
  if (sorted.length === 0) return { counts, min: 0, max: 0, binWidth: 0 };
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const span = max - min;
  if (span <= 0) {
    counts[Math.floor(HISTOGRAM_BINS / 2)] = sorted.length;
    return { counts, min, max, binWidth: 0 };
  }
  const binWidth = span / HISTOGRAM_BINS;
  for (let i = 0; i < sorted.length; i++) {
    const bin = Math.min(HISTOGRAM_BINS - 1, Math.floor((sorted[i] - min) / binWidth));
    counts[bin]++;
  }
  return { counts, min, max, binWidth };
}

/**
 * Junta los tramos (posiblemente calculados en varios workers) y los reduce a
 * percentiles, histogramas y bandas. El orden del resultado no depende de cómo se
 * repartieron las iteraciones: los tramos se ordenan por índice antes de mezclar.
 */
export function reduceSlices(
  slices: McSlice[],
  context: { seed: number; variables: McVariable[]; elapsedMs: number },
): McResult {
  const ordered = [...slices].sort((a, b) => a.from - b.from);
  const iterations = ordered.reduce((t, s) => t + s.count, 0);
  const horizon = ordered.length > 0 ? ordered[0].horizon : 0;

  const metrics: McMetricResult[] = MC_METRICS.map((metric, k) => {
    const merged = new Float64Array(iterations);
    let n = 0;
    let sum = 0;
    let negative = 0;
    for (const slice of ordered) {
      const values = slice.metrics[k];
      for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (Number.isNaN(value)) continue;
        merged[n++] = value;
        sum += value;
        if (value < 0) negative++;
      }
    }
    const sorted = merged.subarray(0, n).slice().sort();
    const mean = n > 0 ? sum / n : 0;
    let variance = 0;
    for (let i = 0; i < n; i++) variance += (sorted[i] - mean) ** 2;
    return {
      key: metric.key,
      label: metric.label,
      format: metric.format,
      higherIsBetter: metric.higherIsBetter,
      count: n,
      mean,
      stdev: n > 1 ? Math.sqrt(variance / (n - 1)) : 0,
      min: n > 0 ? sorted[0] : 0,
      max: n > 0 ? sorted[n - 1] : 0,
      percentiles: Float64Array.from(PERCENTILE_LEVELS, (p) => percentile(sorted, p)),
      histogram: histogram(sorted),
      shareNegative: n > 0 ? negative / n : 0,
    };
  });

  const scratch = new Float64Array(iterations);
  const fan: McFanResult[] = MC_FAN_SERIES.map((series, s) => {
    const bands = new Float64Array(FAN_LEVELS.length * horizon);
    for (let m = 0; m < horizon; m++) {
      let n = 0;
      for (const slice of ordered) {
        const buffer = slice.fan[s];
        for (let i = 0; i < slice.count; i++) {
          const value = buffer[i * horizon + m];
          if (!Number.isNaN(value)) scratch[n++] = value;
        }
      }
      const sorted = scratch.subarray(0, n).slice().sort();
      for (let l = 0; l < FAN_LEVELS.length; l++) {
        bands[l * horizon + m] = percentile(sorted, FAN_LEVELS[l]);
      }
    }
    return { key: series.key, label: series.label, format: series.format, horizon, bands };
  });

  const insolvent = ordered.reduce((t, s) => t + s.insolventCount, 0);
  let worst = ordered[0];
  for (const slice of ordered) if (slice.worstEquity < (worst?.worstEquity ?? Infinity)) worst = slice;

  const equity = metrics[0];

  return {
    iterations,
    seed: context.seed,
    horizon,
    variables: context.variables,
    metrics,
    fan,
    probInsolvency: iterations > 0 ? insolvent / iterations : 0,
    probEquityLoss: equity.shareNegative,
    worstIteration: worst?.worstIteration ?? 0,
    worstEquity: worst?.worstEquity ?? 0,
    worstSample: worst?.worstSample ?? new Float64Array(0),
    elapsedMs: context.elapsedMs,
  };
}

/** Buffers que conviene transferir en vez de copiar al mandar un tramo por `postMessage`. */
export function sliceTransferables(slice: McSlice): ArrayBuffer[] {
  return [
    ...slice.metrics.map((a) => a.buffer as ArrayBuffer),
    ...slice.fan.map((a) => a.buffer as ArrayBuffer),
    slice.worstSample.buffer as ArrayBuffer,
  ];
}
