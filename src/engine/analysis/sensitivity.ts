import type { ParamPath } from '../types';
import { findBreakpoint } from './breakpoint';

/** Una variable con su valor actual y los dos extremos que se van a probar. */
export interface SensitivityVariable {
  path: ParamPath;
  label: string;
  unit?: string;
  /** Valor vigente en la finca: el centro de la barra. */
  base: number;
  low: number;
  high: number;
}

export interface Breakpoint {
  /** Valor de la variable en que la métrica cruza el umbral. */
  value: number;
  metric: number;
  /** Hacia qué lado hay que moverse para quebrar. */
  side: 'low' | 'high';
}

export interface TornadoBar {
  path: ParamPath;
  label: string;
  unit?: string;
  base: number;
  low: number;
  high: number;
  baseMetric: number | null;
  lowMetric: number | null;
  highMetric: number | null;
  /** Amplitud de la métrica entre ambos extremos: es lo que ordena el tornado. */
  swing: number;
  breakpoint: Breakpoint | null;
}

export interface TornadoOptions {
  variables: SensitivityVariable[];
  /** Métrica resultante de mover una sola variable a un valor dado. */
  evaluate: (path: ParamPath, value: number) => number | null;
  baseMetric: number | null;
  /** Valor de la métrica que marca el quiebre (típicamente 0). */
  threshold: number;
  maxBisections?: number;
}

/**
 * Barrido de una variable a la vez (todo lo demás en su valor base). Solo se bisecta
 * cuando el umbral queda dentro del rango probado: si la finca aguanta los dos extremos
 * no hay punto de quiebre que buscar y nos ahorramos ~12 corridas del motor por variable.
 */
export function tornadoBars(
  options: TornadoOptions,
  from = 0,
  to = options.variables.length,
  onStep?: (done: number, total: number) => void,
): TornadoBar[] {
  const { variables, evaluate, baseMetric, threshold } = options;
  const maxIterations = options.maxBisections ?? 14;
  const bars: TornadoBar[] = [];
  const total = Math.max(0, to - from);

  for (let i = from; i < to; i++) {
    const v = variables[i];
    const lowMetric = evaluate(v.path, v.low);
    const highMetric = evaluate(v.path, v.high);

    let breakpoint: Breakpoint | null = null;
    const tolerance = Math.abs(v.high - v.low) / 1000;

    // Se bisecta desde el valor actual hacia el extremo que cruza: así el punto de
    // quiebre se lee como "cuánto puede moverse desde donde estás hoy".
    for (const side of ['low', 'high'] as const) {
      if (breakpoint) break;
      const end = side === 'low' ? v.low : v.high;
      const endMetric = side === 'low' ? lowMetric : highMetric;
      if (baseMetric === null || endMetric === null) continue;
      if (Math.sign(baseMetric - threshold) === Math.sign(endMetric - threshold)) continue;
      const hit = findBreakpoint({
        lo: Math.min(v.base, end),
        hi: Math.max(v.base, end),
        target: threshold,
        evaluate: (x) => evaluate(v.path, x),
        tolerance,
        maxIterations,
      });
      if (hit) breakpoint = { value: hit.value, metric: hit.metric, side };
    }

    bars.push({
      path: v.path,
      label: v.label,
      unit: v.unit,
      base: v.base,
      low: v.low,
      high: v.high,
      baseMetric,
      lowMetric,
      highMetric,
      swing:
        lowMetric === null || highMetric === null ? 0 : Math.abs(highMetric - lowMetric),
      breakpoint,
    });

    onStep?.(i - from + 1, total);
  }

  return bars;
}

/** Ordena de mayor a menor amplitud: el tornado se lee de arriba abajo. */
export function sortBySwing(bars: TornadoBar[]): TornadoBar[] {
  return [...bars].sort((a, b) => b.swing - a.swing);
}
