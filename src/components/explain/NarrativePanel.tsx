'use client';

import { useMemo } from 'react';
import type { Assumptions, ScenarioOverride, SimulationOutput } from '@/engine/types';
import { type Severity, buildExplanation } from '@/lib/explain/narrative';
import type { EditMap } from '@/lib/state/useAssumptionsStore';
import { AiExplainButton } from './AiExplainButton';
import { LossBreakdown } from './LossBreakdown';

const DOT: Record<Severity, string> = {
  good: 'bg-emerald-500',
  info: 'bg-zinc-300',
  warn: 'bg-amber-500',
  danger: 'bg-red-500',
};

export function NarrativePanel({
  base,
  output,
  assumptions,
  edits,
  overrides,
}: {
  base: SimulationOutput;
  output: SimulationOutput;
  assumptions: Assumptions;
  edits: EditMap;
  overrides: ScenarioOverride[];
}) {
  const explanation = useMemo(
    () => buildExplanation(base, output, assumptions, edits, overrides),
    [base, output, assumptions, edits, overrides],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-3">
        {explanation.sections.map((section) => (
          <section key={section.id}>
            <h3 className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
              {section.title}
            </h3>
            <ul className="mt-1 space-y-1">
              {section.items.map((item) => (
                <li key={item.id} className="flex gap-2 text-[13px] leading-relaxed text-zinc-700">
                  <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${DOT[item.severity]}`} />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <AiExplainButton explanation={explanation} output={output} />
      </div>
      <LossBreakdown loss={explanation.loss} />
    </div>
  );
}
