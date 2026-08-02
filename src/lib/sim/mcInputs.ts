import type { McVariable } from '@/engine/analysis/montecarlo';
import type { SensitivityVariable } from '@/engine/analysis/sensitivity';
import type { Assumptions } from '@/engine/types';
import { MC_VARIABLES, type VariableSpec, readValue } from '@/lib/assumptions/schema';

/**
 * Rango de incertidumbre de una variable, centrado en lo que la finca tiene hoy.
 *
 * El rango del esquema está declarado alrededor de su moda. Si el usuario ya movió la
 * variable dentro de ese rango, solo se recoloca la moda: la incertidumbre declarada
 * sigue valiendo. Si la sacó fuera del rango (una finca con precios muy distintos),
 * el rango se reescala en proporción para no muestrear valores que el usuario ya
 * descartó, ni dejar el valor actual fuera de su propia distribución.
 */
export function mcVariableFor(spec: VariableSpec, current: number): McVariable | null {
  const mc = spec.mc;
  if (!mc) return null;
  const inside = current >= mc.min && current <= mc.max;
  const k = inside || mc.mode === 0 ? 1 : current / mc.mode;
  const scaled = k > 0 ? k : 1;
  return {
    path: spec.path,
    label: spec.label,
    dist: mc.dist,
    min: Math.min(mc.min * scaled, current),
    mode: current,
    max: Math.max(mc.max * scaled, current),
  };
}

/** Las variables inciertas de la finca activa, con su valor vigente como moda. */
export function mcVariablesFor(assumptions: Assumptions): McVariable[] {
  const out: McVariable[] = [];
  for (const spec of MC_VARIABLES) {
    const variable = mcVariableFor(spec, readValue(assumptions, spec));
    if (variable) out.push(variable);
  }
  return out;
}

/** Los mismos rangos, en el formato que consume el barrido de sensibilidad. */
export function sensitivityVariablesFor(assumptions: Assumptions): SensitivityVariable[] {
  return mcVariablesFor(assumptions).map((v) => ({
    path: v.path,
    label: v.label,
    unit: MC_VARIABLES.find((s) => s.path === v.path)?.unit,
    base: v.mode,
    low: v.min,
    high: v.max,
  }));
}
