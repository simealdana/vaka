'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type McResult,
  type McSlice,
  type McVariable,
  reduceSlices,
} from '@/engine/analysis/montecarlo';
import { type TornadoBar, sortBySwing } from '@/engine/analysis/sensitivity';
import type { SimulationOutput } from '@/engine/types';
import { MC_VARIABLES } from '@/lib/assumptions/schema';
import { mcVariablesFor } from '@/lib/sim/mcInputs';
import { buildAssumptions, useAssumptionsStore } from '@/lib/state/useAssumptionsStore';
import { MC_CHUNK_SIZE, type RunContext, type WorkerRequest, type WorkerResponse } from './protocol';

export type WorkerStatus = 'idle' | 'running' | 'done' | 'cancelled' | 'error';
export type WorkerJob = 'run' | 'montecarlo' | 'tornado';

interface PendingJob {
  runId: number;
  kind: WorkerJob;
  startedAt: number;
  /** Progreso reportado por cada worker del pool. */
  done: number[];
  total: number[];
  slices: McSlice[];
  bars: TornadoBar[][];
  /** Cuántos workers tienen trabajo asignado en esta corrida. */
  expected: number;
  received: number;
  variables: McVariable[];
  seed: number;
}

export interface WorkerProgress {
  done: number;
  total: number;
}

export interface SimulationWorkerApi {
  /** Workers realmente en uso; 1 sigue siendo correcto, solo más lento. */
  poolSize: number;
  status: WorkerStatus;
  job: WorkerJob | null;
  progress: WorkerProgress;
  output: SimulationOutput | null;
  monteCarlo: McResult | null;
  tornado: TornadoBar[] | null;
  error: string | null;
  runSimulation: () => void;
  runMonteCarlo: (options: { iterations: number; seed: number }) => void;
  runTornado: (options: { metricKey: string; threshold: number }) => void;
  cancel: () => void;
}

/**
 * Una corrida de 120 meses cuesta ~50 ms, así que 5.000 iteraciones son minutos en un
 * solo hilo. El reparto por tramos `[from, to)` es determinista: el índice global de la
 * iteración fija su semilla, de modo que el resultado no depende de cuántos workers haya.
 */
function poolSizeFor(): number {
  if (typeof navigator === 'undefined') return 1;
  return Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
}

function splitRange(total: number, parts: number): [number, number][] {
  const ranges: [number, number][] = [];
  let from = 0;
  for (let i = 0; i < parts && from < total; i++) {
    const size = Math.ceil((total - from) / (parts - i));
    ranges.push([from, from + size]);
    from += size;
  }
  return ranges;
}

export function useSimulationWorker(): SimulationWorkerApi {
  const workersRef = useRef<Worker[]>([]);
  const pendingRef = useRef<PendingJob | null>(null);
  const runIdRef = useRef(0);

  const [poolSize, setPoolSize] = useState(1);
  const [status, setStatus] = useState<WorkerStatus>('idle');
  const [job, setJob] = useState<WorkerJob | null>(null);
  const [progress, setProgress] = useState<WorkerProgress>({ done: 0, total: 0 });
  const [output, setOutput] = useState<SimulationOutput | null>(null);
  const [monteCarlo, setMonteCarlo] = useState<McResult | null>(null);
  const [tornado, setTornado] = useState<TornadoBar[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMessage = useCallback((index: number, response: WorkerResponse) => {
    const pending = pendingRef.current;
    // Resultado obsoleto: la corrida a la que pertenece ya fue cancelada o reemplazada.
    if (!pending || response.runId !== pending.runId) return;

    switch (response.type) {
      case 'PROGRESS': {
        pending.done[index] = response.done;
        pending.total[index] = response.total;
        setProgress({
          done: pending.done.reduce((t, n) => t + n, 0),
          total: pending.total.reduce((t, n) => t + n, 0),
        });
        break;
      }
      case 'RESULT': {
        pendingRef.current = null;
        setOutput(response.output);
        setStatus('done');
        break;
      }
      case 'MC_SLICE': {
        pending.slices.push(response.slice);
        pending.received++;
        if (pending.received < pending.expected) break;
        pendingRef.current = null;
        setMonteCarlo(
          reduceSlices(pending.slices, {
            seed: pending.seed,
            variables: pending.variables,
            elapsedMs: Date.now() - pending.startedAt,
          }),
        );
        setStatus('done');
        break;
      }
      case 'TORNADO_SLICE': {
        pending.bars[index] = response.bars;
        pending.received++;
        if (pending.received < pending.expected) break;
        pendingRef.current = null;
        setTornado(sortBySwing(pending.bars.flat()));
        setStatus('done');
        break;
      }
      case 'CANCELLED': {
        pendingRef.current = null;
        setStatus('cancelled');
        break;
      }
      case 'ERROR': {
        pendingRef.current = null;
        setError(response.message);
        setStatus('error');
        break;
      }
    }
  }, []);

  const ensurePool = useCallback((): Worker[] => {
    if (workersRef.current.length > 0) return workersRef.current;
    const size = poolSizeFor();
    const created: Worker[] = [];
    for (let i = 0; i < size; i++) {
      const instance = new Worker(new URL('./simulation.worker.ts', import.meta.url), {
        type: 'module',
      });
      instance.addEventListener('message', (event: MessageEvent<WorkerResponse>) =>
        handleMessage(i, event.data),
      );
      created.push(instance);
    }
    workersRef.current = created;
    setPoolSize(size);
    return created;
  }, [handleMessage]);

  useEffect(
    () => () => {
      for (const instance of workersRef.current) instance.terminate();
      workersRef.current = [];
      pendingRef.current = null;
    },
    [],
  );

  /** Congela la finca y el escenario del momento: la corrida no debe verlos cambiar. */
  const context = useCallback((): RunContext => {
    const state = useAssumptionsStore.getState();
    return { base: state.base, scenario: { edits: state.edits, overrides: state.overrides } };
  }, []);

  const start = useCallback(
    (kind: WorkerJob, variables: McVariable[], seed: number, expected: number): PendingJob => {
      const runId = ++runIdRef.current;
      const pending: PendingJob = {
        runId,
        kind,
        startedAt: Date.now(),
        done: [],
        total: [],
        slices: [],
        bars: [],
        expected,
        received: 0,
        variables,
        seed,
      };
      pendingRef.current = pending;
      setJob(kind);
      setStatus('running');
      setError(null);
      setProgress({ done: 0, total: 0 });
      return pending;
    },
    [],
  );

  const runSimulation = useCallback(() => {
    const pool = ensurePool();
    const pending = start('run', [], 0, 1);
    const request: WorkerRequest = { type: 'RUN', runId: pending.runId, ...context() };
    pool[0].postMessage(request);
  }, [context, ensurePool, start]);

  const runMonteCarlo = useCallback(
    ({ iterations, seed }: { iterations: number; seed: number }) => {
      const pool = ensurePool();
      const shared = context();
      const ranges = splitRange(iterations, pool.length);
      const variables = mcVariablesFor(
        buildAssumptions({ ...shared.base, ...shared.scenario.edits }),
      );
      const pending = start('montecarlo', variables, seed, ranges.length);
      setMonteCarlo(null);
      ranges.forEach(([from, to], i) => {
        const request: WorkerRequest = {
          type: 'MONTECARLO',
          runId: pending.runId,
          seed,
          from,
          to,
          chunkSize: MC_CHUNK_SIZE,
          ...shared,
        };
        pool[i].postMessage(request);
      });
    },
    [context, ensurePool, start],
  );

  const runTornado = useCallback(
    ({ metricKey, threshold }: { metricKey: string; threshold: number }) => {
      const pool = ensurePool();
      const ranges = splitRange(MC_VARIABLES.length, pool.length);
      const pending = start('tornado', [], 0, ranges.length);
      setTornado(null);
      const shared = context();
      ranges.forEach(([from, to], i) => {
        const request: WorkerRequest = {
          type: 'TORNADO',
          runId: pending.runId,
          metricKey,
          threshold,
          from,
          to,
          ...shared,
        };
        pool[i].postMessage(request);
      });
    },
    [context, ensurePool, start],
  );

  const cancel = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    for (const instance of workersRef.current) {
      instance.postMessage({ type: 'CANCEL', runId: pending.runId } satisfies WorkerRequest);
    }
    setStatus('cancelled');
  }, []);

  return {
    poolSize,
    status,
    job,
    progress,
    output,
    monteCarlo,
    tornado,
    error,
    runSimulation,
    runMonteCarlo,
    runTornado,
    cancel,
  };
}
