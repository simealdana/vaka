import type { McSlice } from '@/engine/analysis/montecarlo';
import type { TornadoBar } from '@/engine/analysis/sensitivity';
import type { SimulationOutput } from '@/engine/types';
import type { EditMap, ScenarioState } from '@/lib/state/useAssumptionsStore';

/** Lo que hace falta para reconstruir la corrida: la finca y el escenario encima. */
export interface RunContext {
  base: EditMap;
  scenario: ScenarioState;
}

/**
 * Todo mensaje lleva `runId`. El worker descarta lo que llegue de una corrida vieja y
 * el cliente descarta lo que llegue con un `runId` que ya no es el suyo: sin eso, una
 * corrida cancelada puede pisar el resultado de la siguiente.
 */
export type WorkerRequest =
  | ({ type: 'RUN'; runId: number } & RunContext)
  | ({
      type: 'MONTECARLO';
      runId: number;
      seed: number;
      /** Tramo global de iteraciones `[from, to)` que le toca a este worker. */
      from: number;
      to: number;
      chunkSize: number;
    } & RunContext)
  | ({
      type: 'TORNADO';
      runId: number;
      /** Clave de `MC_METRICS` sobre la que se mide el impacto. */
      metricKey: string;
      threshold: number;
      /** Tramo de variables `[from, to)`. */
      from: number;
      to: number;
    } & RunContext)
  | { type: 'CANCEL'; runId: number };

export type WorkerResponse =
  | { type: 'RESULT'; runId: number; output: SimulationOutput }
  | { type: 'PROGRESS'; runId: number; done: number; total: number }
  | { type: 'MC_SLICE'; runId: number; slice: McSlice }
  | { type: 'TORNADO_SLICE'; runId: number; bars: TornadoBar[] }
  | { type: 'CANCELLED'; runId: number }
  | { type: 'ERROR'; runId: number; message: string };

/** Iteraciones por chunk: entre cada uno el worker cede el hilo y atiende un CANCEL. */
export const MC_CHUNK_SIZE = 200;
