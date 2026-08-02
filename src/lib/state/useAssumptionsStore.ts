import { create } from 'zustand';
import { DEFAULT_ASSUMPTIONS } from '@/engine/defaults';
import { setByPathCopying } from '@/engine/scenario/resolve';
import type { Assumptions, ParamPath, ScenarioOverride } from '@/engine/types';
import { VARIABLES_BY_PATH, baseValue } from '@/lib/assumptions/schema';

/** Solo se guardan las variables que el usuario tocó; el resto sale de los defaults. */
export type EditMap = Readonly<Record<ParamPath, number>>;

/** Lo que define un escenario: cambios permanentes de supuestos más eventos con fecha. */
export interface ScenarioState {
  edits: EditMap;
  overrides: ScenarioOverride[];
}

interface AssumptionsStore extends ScenarioState {
  name: string;
  /** Configuración de la finca activa: el punto de partida sobre el que se mide el escenario. */
  base: EditMap;
  setValue: (path: ParamPath, value: number) => void;
  resetValue: (path: ParamPath) => void;
  resetAll: () => void;
  setName: (name: string) => void;
  addOverride: (o: ScenarioOverride) => void;
  updateOverride: (id: string, patch: Partial<ScenarioOverride>) => void;
  removeOverride: (id: string) => void;
  load: (scenario: ScenarioState & { name?: string }) => void;
}

/** Valor de partida de una variable en la finca activa, antes de aplicarle el escenario. */
export function baseFor(path: ParamPath, base: EditMap): number {
  const stored = base[path];
  if (stored !== undefined) return stored;
  const spec = VARIABLES_BY_PATH.get(path);
  return spec ? baseValue(spec) : 0;
}

export const useAssumptionsStore = create<AssumptionsStore>((set) => ({
  edits: {},
  overrides: [],
  name: 'Escenario base',
  base: {},

  setValue: (path, value) =>
    set((s) => {
      const spec = VARIABLES_BY_PATH.get(path);
      // Volver al valor base equivale a no haberlo tocado: así el contador de modificadas
      // y el badge de delta no se quedan encendidos con un cambio que ya no existe.
      if (spec && value === baseFor(path, s.base)) {
        if (!(path in s.edits)) return s;
        const next = { ...s.edits };
        delete next[path];
        return { edits: next };
      }
      if (s.edits[path] === value) return s;
      return { edits: { ...s.edits, [path]: value } };
    }),

  resetValue: (path) =>
    set((s) => {
      if (!(path in s.edits)) return s;
      const next = { ...s.edits };
      delete next[path];
      return { edits: next };
    }),

  resetAll: () => set({ edits: {}, overrides: [] }),
  setName: (name) => set({ name }),

  addOverride: (o) => set((s) => ({ overrides: [...s.overrides, o] })),
  updateOverride: (id, patch) =>
    set((s) => ({ overrides: s.overrides.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
  removeOverride: (id) => set((s) => ({ overrides: s.overrides.filter((o) => o.id !== id) })),

  load: (scenario) =>
    set({
      edits: scenario.edits,
      overrides: scenario.overrides,
      ...(scenario.name ? { name: scenario.name } : {}),
    }),
}));

export function buildAssumptions(edits: EditMap): Assumptions {
  const paths = Object.keys(edits);
  if (paths.length === 0) return DEFAULT_ASSUMPTIONS;
  const out = { ...DEFAULT_ASSUMPTIONS } as unknown as Record<string, unknown>;
  for (const path of paths) {
    const spec = VARIABLES_BY_PATH.get(path);
    const raw = edits[path];
    setByPathCopying(out, path, spec?.kind === 'boolean' ? raw === 1 : raw);
  }
  return out as unknown as Assumptions;
}
