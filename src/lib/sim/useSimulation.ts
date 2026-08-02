'use client';

import { useMemo } from 'react';
import { simulate } from '@/engine/simulate';
import type { Assumptions, SimulationOutput } from '@/engine/types';
import {
  type EditMap,
  type ScenarioState,
  buildAssumptions,
  useAssumptionsStore,
} from '@/lib/state/useAssumptionsStore';
import { EMPTY_BASE } from '@/lib/state/useProjectsStore';

const baselines = new WeakMap<EditMap, SimulationOutput>();

/**
 * La finca del proyecto sin escenario encima: es la referencia de todas las gráficas.
 * Se cachea por identidad del objeto `base`, que solo cambia al editar el proyecto.
 */
export function baselineOutput(base: EditMap = EMPTY_BASE): SimulationOutput {
  let output = baselines.get(base);
  if (!output) {
    output = simulate(buildAssumptions(base));
    baselines.set(base, output);
  }
  return output;
}

export function runScenario(scenario: ScenarioState, base: EditMap = EMPTY_BASE): SimulationOutput {
  if (Object.keys(scenario.edits).length === 0 && scenario.overrides.length === 0) {
    return baselineOutput(base);
  }
  return simulate(buildAssumptions({ ...base, ...scenario.edits }), scenario.overrides);
}

export interface SimulationView {
  assumptions: Assumptions;
  output: SimulationOutput;
  base: SimulationOutput;
  modified: boolean;
}

export function useSimulation(): SimulationView {
  const edits = useAssumptionsStore((s) => s.edits);
  const overrides = useAssumptionsStore((s) => s.overrides);
  const projectBase = useAssumptionsStore((s) => s.base);
  return useMemo(() => {
    const assumptions = buildAssumptions({ ...projectBase, ...edits });
    const base = baselineOutput(projectBase);
    const output = runScenario({ edits, overrides }, projectBase);
    return { assumptions, output, base, modified: output !== base };
  }, [edits, overrides, projectBase]);
}
