import { z } from 'zod';
import type { ScenarioOverride } from '@/engine/types';
import type { ScenarioState } from '@/lib/state/useAssumptionsStore';

const overrideSchema = z.object({
  id: z.string(),
  label: z.string(),
  target: z.string(),
  op: z.enum(['multiply', 'set', 'add', 'pctDelta']),
  value: z.number(),
  startMonth: z.number(),
  // JSON no sabe expresar Infinity: los eventos permanentes viajan como null.
  durationMonths: z.number().nullable(),
  rampInMonths: z.number().optional(),
  recovery: z
    .object({ type: z.enum(['none', 'immediate', 'linear', 'exponential']), months: z.number() })
    .optional(),
  repeat: z.object({ everyMonths: z.number(), times: z.number() }).optional(),
  priority: z.number().optional(),
});

const fileSchema = z.object({
  format: z.literal('vaka-scenario'),
  version: z.literal(1),
  scenarios: z.array(
    z.object({
      name: z.string(),
      edits: z.record(z.string(), z.number()),
      overrides: z.array(overrideSchema),
    }),
  ),
});

export interface PortableScenario extends ScenarioState {
  name: string;
}

const encode = (o: ScenarioOverride) => ({
  ...o,
  durationMonths: Number.isFinite(o.durationMonths) ? o.durationMonths : null,
});

const decode = (o: z.infer<typeof overrideSchema>): ScenarioOverride => ({
  ...o,
  durationMonths: o.durationMonths ?? Number.POSITIVE_INFINITY,
});

export function exportScenarios(scenarios: PortableScenario[]): string {
  return JSON.stringify(
    {
      format: 'vaka-scenario',
      version: 1,
      scenarios: scenarios.map((s) => ({
        name: s.name,
        edits: s.edits,
        overrides: s.overrides.map(encode),
      })),
    },
    null,
    2,
  );
}

export function importScenarios(text: string): PortableScenario[] {
  const parsed = fileSchema.parse(JSON.parse(text));
  return parsed.scenarios.map((s) => ({
    name: s.name,
    edits: s.edits,
    overrides: s.overrides.map(decode),
  }));
}
