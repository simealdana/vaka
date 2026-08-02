import type { Assumptions, ParamPath, ScenarioOverride } from '../types';

export function getByPath(obj: unknown, path: ParamPath): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Escribe en `target` clonando solo las ramas tocadas, para no copiar todo el objeto. */
export function setByPathCopying(
  target: Record<string, unknown>,
  path: ParamPath,
  value: unknown,
): void {
  const keys = path.split('.');
  let cur = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const next = cur[k];
    if (next == null || typeof next !== 'object') return;
    const copy = Array.isArray(next) ? [...next] : { ...(next as Record<string, unknown>) };
    cur[k] = copy;
    cur = copy as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
}

/**
 * Peso del efecto de un override en un mes dado: 0 fuera de la ventana, 1 en pleno efecto,
 * y valores intermedios durante la rampa de entrada o la recuperación.
 */
export function overrideWeight(o: ScenarioOverride, month: number): number {
  const ramp = Math.max(0, o.rampInMonths ?? 0);
  const duration = o.durationMonths;
  const recoveryType = o.recovery?.type ?? 'immediate';
  const recoveryMonths = recoveryType === 'linear' || recoveryType === 'exponential'
    ? Math.max(0, o.recovery?.months ?? 0)
    : 0;

  const occurrences = o.repeat ? Math.max(1, o.repeat.times) : 1;
  const stride = o.repeat ? Math.max(1, o.repeat.everyMonths) : 0;

  let best = 0;
  for (let k = 0; k < occurrences; k++) {
    const start = o.startMonth + k * stride;
    if (month < start) continue;

    const elapsed = month - start;
    let w = 0;

    if (ramp > 0 && elapsed < ramp) {
      w = (elapsed + 1) / ramp;
    } else if (!Number.isFinite(duration) || elapsed < duration) {
      w = 1;
    } else if (recoveryType === 'none') {
      w = 1;
    } else if (recoveryMonths > 0) {
      const p = (elapsed - duration) / recoveryMonths;
      if (p < 1) w = recoveryType === 'exponential' ? Math.exp(-3 * p) : 1 - p;
    }

    if (w > best) best = w;
  }
  return best;
}

function applyOp(current: number, o: ScenarioOverride, weight: number): number {
  if (weight <= 0) return current;
  switch (o.op) {
    case 'multiply':
      return current * (1 + (o.value - 1) * weight);
    case 'pctDelta':
      return current * (1 + o.value * weight);
    case 'add':
      return current + o.value * weight;
    case 'set':
      return current + (o.value - current) * weight;
  }
}

export type ResolvedTimelines = Map<ParamPath, Float64Array>;

/**
 * Precompila cada parámetro afectado en una serie de `horizonMonths` valores, para que el
 * bucle mensual no tenga que evaluar lógica de eventos.
 */
export function resolveTimelines(
  base: Assumptions,
  overrides: ScenarioOverride[],
  horizonMonths: number,
): ResolvedTimelines {
  const byPath = new Map<ParamPath, ScenarioOverride[]>();
  for (const o of overrides) {
    const list = byPath.get(o.target);
    if (list) list.push(o);
    else byPath.set(o.target, [o]);
  }

  const timelines: ResolvedTimelines = new Map();

  for (const [path, list] of byPath) {
    const baseValue = getByPath(base, path);
    if (typeof baseValue !== 'number' || !Number.isFinite(baseValue)) continue;

    const sorted = [...list].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    const series = new Float64Array(horizonMonths).fill(baseValue);

    for (let m = 0; m < horizonMonths; m++) {
      let v = baseValue;
      for (const o of sorted) v = applyOp(v, o, overrideWeight(o, m));
      series[m] = v;
    }
    timelines.set(path, series);
  }

  return timelines;
}

/** Devuelve los supuestos vigentes en el mes dado. */
export function assumptionsAt(
  base: Assumptions,
  timelines: ResolvedTimelines,
  month: number,
): Assumptions {
  if (timelines.size === 0) return base;
  const out = { ...base } as unknown as Record<string, unknown>;
  for (const [path, series] of timelines) {
    setByPathCopying(out, path, series[Math.min(month, series.length - 1)]);
  }
  return out as unknown as Assumptions;
}
