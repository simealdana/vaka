/// <reference lib="webworker" />

import {
  MC_METRICS,
  McRunner,
  sliceTransferables,
} from '@/engine/analysis/montecarlo';
import { tornadoBars } from '@/engine/analysis/sensitivity';
import { setByPathCopying } from '@/engine/scenario/resolve';
import { simulate } from '@/engine/simulate';
import type { Assumptions, ParamPath, SimulationSummary } from '@/engine/types';
import { mcVariablesFor, sensitivityVariablesFor } from '@/lib/sim/mcInputs';
import { buildAssumptions } from '@/lib/state/useAssumptionsStore';
import type { RunContext, WorkerRequest, WorkerResponse } from './protocol';

const worker = self as unknown as DedicatedWorkerGlobalScope;

/**
 * Corrida vigente. El worker atiende una sola a la vez; cualquier mensaje que llegue
 * con otro `runId` mientras hay una en curso la deja obsoleta y se descarta su salida.
 */
let activeRunId = -1;
let cancelRequested = false;

/**
 * Cede el hilo para que el `onmessage` pendiente (un CANCEL, o una corrida nueva)
 * se procese. `setTimeout` es lo único que garantiza vaciar la cola de mensajes:
 * una microtarea volvería sin haber atendido nada.
 */
const yieldToMessages = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const post = (message: WorkerResponse, transfer?: Transferable[]): void => {
  if (message.runId !== activeRunId) return;
  if (transfer) worker.postMessage(message, transfer);
  else worker.postMessage(message);
};

/** Supuestos de la finca con el escenario aplicado: el centro de todo el análisis. */
function contextAssumptions(context: RunContext): Assumptions {
  return buildAssumptions({ ...context.base, ...context.scenario.edits });
}

/** Aplica valores puntuales sobre los supuestos del escenario sin mutarlos. */
function withValues(
  assumptions: Assumptions,
  paths: readonly ParamPath[],
  values: ArrayLike<number>,
): Assumptions {
  const out = { ...assumptions } as unknown as Record<string, unknown>;
  for (let i = 0; i < paths.length; i++) setByPathCopying(out, paths[i], values[i]);
  return out as unknown as Assumptions;
}

async function handleRun(message: Extract<WorkerRequest, { type: 'RUN' }>): Promise<void> {
  const output = simulate(contextAssumptions(message), message.scenario.overrides);
  post({ type: 'RESULT', runId: message.runId, output });
}

async function handleMonteCarlo(
  message: Extract<WorkerRequest, { type: 'MONTECARLO' }>,
): Promise<void> {
  const { runId } = message;
  const assumptions = contextAssumptions(message);
  const overrides = message.scenario.overrides;
  const variables = mcVariablesFor(assumptions);
  const paths = variables.map((v) => v.path);

  const runner = new McRunner({
    variables,
    seed: message.seed,
    from: message.from,
    to: message.to,
    horizonMonths: Math.max(1, Math.round(assumptions.horizonMonths)),
    run: (sample) => simulate(withValues(assumptions, paths, sample), overrides),
  });

  post({ type: 'PROGRESS', runId, done: 0, total: runner.total });

  while (!runner.finished) {
    runner.step(message.chunkSize);
    post({ type: 'PROGRESS', runId, done: runner.done, total: runner.total });
    await yieldToMessages();
    if (runId !== activeRunId) return;
    if (cancelRequested) {
      post({ type: 'CANCELLED', runId });
      return;
    }
  }

  const slice = runner.result();
  post({ type: 'MC_SLICE', runId, slice }, sliceTransferables(slice));
}

async function handleTornado(
  message: Extract<WorkerRequest, { type: 'TORNADO' }>,
): Promise<void> {
  const { runId } = message;
  const assumptions = contextAssumptions(message);
  const overrides = message.scenario.overrides;
  const variables = sensitivityVariablesFor(assumptions);
  const metric = MC_METRICS.find((m) => m.key === message.metricKey) ?? MC_METRICS[0];

  const summaryFor = (path: ParamPath, value: number): SimulationSummary =>
    simulate(withValues(assumptions, [path], [value]), overrides).summary;

  const evaluate = (path: ParamPath, value: number) => metric.get(summaryFor(path, value));
  const baseMetric = metric.get(simulate(assumptions, overrides).summary);

  const total = Math.max(0, message.to - message.from);
  post({ type: 'PROGRESS', runId, done: 0, total });

  // El barrido se hace variable por variable para poder ceder el hilo entre cada una:
  // una bisección completa son ~12 corridas del motor y no queremos bloquear el CANCEL.
  const bars = [];
  for (let i = message.from; i < message.to; i++) {
    const bar = tornadoBars(
      { variables, evaluate, baseMetric, threshold: message.threshold },
      i,
      i + 1,
    );
    bars.push(...bar);
    post({ type: 'PROGRESS', runId, done: bars.length, total });
    await yieldToMessages();
    if (runId !== activeRunId) return;
    if (cancelRequested) {
      post({ type: 'CANCELLED', runId });
      return;
    }
  }

  post({ type: 'TORNADO_SLICE', runId, bars });
}

worker.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === 'CANCEL') {
    if (message.runId === activeRunId) cancelRequested = true;
    return;
  }

  activeRunId = message.runId;
  cancelRequested = false;

  const job =
    message.type === 'RUN'
      ? handleRun(message)
      : message.type === 'MONTECARLO'
        ? handleMonteCarlo(message)
        : handleTornado(message);

  void job.catch((error: unknown) => {
    post({
      type: 'ERROR',
      runId: message.runId,
      message: error instanceof Error ? error.message : String(error),
    });
  });
});
