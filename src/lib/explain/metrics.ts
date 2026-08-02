import type { Assumptions, ScenarioOverride, SimulationOutput } from '@/engine/types';
import { VARIABLES_BY_PATH, baseValue } from '@/lib/assumptions/schema';
import type { EditMap } from '@/lib/state/useAssumptionsStore';

export interface ChangedVariable {
  label: string;
  path: string;
  from: number;
  to: number;
  /** `null` cuando el valor base es cero y el cambio relativo no significa nada. */
  deltaPct: number | null;
}

export interface Findings {
  changed: ChangedVariable[];
  events: { label: string; startMonth: number; durationMonths: number }[];

  /** Promedio mensual calculado solo sobre los meses realmente afectados. */
  revenueDeltaPerMonth: number;
  costDeltaPerMonth: number;
  affectedMonths: number;

  firstNegativeCashMonth: number | null;
  firstBelowBufferMonth: number | null;
  monthsOfBuffer: number | null;
  maxDeficit: number;
  capitalNeeded: number;

  cashDelta: number;
  equityDelta: number;
  equityDeltaPct: number | null;
  equityByYear: { year: number; base: number; scenario: number }[];
  liquidationDelta: number;
  irrDelta: number | null;

  milkDeltaPct: number | null;
  herdDeltaPct: number | null;
  costPerLiterDelta: number;
  minBcs: number;
  underfedMonths: number;
  monthsInsolvent: number;
  worseThanBase: boolean;
}

const safePct = (now: number, before: number): number | null =>
  before === 0 ? null : now / before - 1;

export function deriveFindings(
  base: SimulationOutput,
  scenario: SimulationOutput,
  assumptions: Assumptions,
  edits: EditMap,
  overrides: ScenarioOverride[],
): Findings {
  const changed: ChangedVariable[] = Object.keys(edits).flatMap((path) => {
    const spec = VARIABLES_BY_PATH.get(path);
    if (!spec) return [];
    const from = baseValue(spec);
    const to = edits[path];
    return [{ label: spec.label, path, from, to, deltaPct: safePct(to, from) }];
  });

  let revenueDelta = 0;
  let costDelta = 0;
  let affectedMonths = 0;
  let firstNegativeCashMonth: number | null = null;
  let firstBelowBufferMonth: number | null = null;
  let maxDeficit = 0;
  let minBcs = Number.POSITIVE_INFINITY;
  let underfedMonths = 0;

  const buffer = assumptions.capital.minCashBuffer;

  for (let i = 0; i < scenario.months.length; i++) {
    const m = scenario.months[i];
    const b = base.months[i];
    if (b) {
      const dRev = m.pnl.revenueTotal - b.pnl.revenueTotal;
      const dCost = m.pnl.costTotal - b.pnl.costTotal;
      if (Math.abs(dRev) > 1 || Math.abs(dCost) > 1) {
        revenueDelta += dRev;
        costDelta += dCost;
        affectedMonths++;
      }
    }
    if (m.cash.balance < 0) {
      firstNegativeCashMonth ??= m.month;
      maxDeficit = Math.max(maxDeficit, -m.cash.balance);
    }
    if (m.cash.balance < buffer) firstBelowBufferMonth ??= m.month;
    if (m.feed.bcs < minBcs) minBcs = m.feed.bcs;
    if (m.flags.underfed) underfedMonths++;
  }

  const years = [1, 3, 5, 10];
  const equityByYear = years.map((year) => ({
    year,
    base: base.summary.equityByYear[year] ?? 0,
    scenario: scenario.summary.equityByYear[year] ?? 0,
  }));

  const equityDelta = scenario.summary.finalBookEquity - base.summary.finalBookEquity;

  return {
    changed,
    events: overrides.map((o) => ({
      label: o.label,
      startMonth: o.startMonth,
      durationMonths: o.durationMonths,
    })),

    revenueDeltaPerMonth: affectedMonths > 0 ? revenueDelta / affectedMonths : 0,
    costDeltaPerMonth: affectedMonths > 0 ? costDelta / affectedMonths : 0,
    affectedMonths,

    firstNegativeCashMonth,
    firstBelowBufferMonth,
    monthsOfBuffer: firstBelowBufferMonth,
    maxDeficit,
    capitalNeeded: Math.max(maxDeficit, scenario.summary.maxCapitalRequired),

    cashDelta: scenario.summary.worstCashBalance - base.summary.worstCashBalance,
    equityDelta,
    equityDeltaPct: safePct(scenario.summary.finalBookEquity, base.summary.finalBookEquity),
    equityByYear,
    liquidationDelta:
      scenario.summary.finalLiquidationEquity - base.summary.finalLiquidationEquity,
    irrDelta:
      scenario.summary.irrAnnual === null || base.summary.irrAnnual === null
        ? null
        : scenario.summary.irrAnnual - base.summary.irrAnnual,

    milkDeltaPct: safePct(scenario.summary.totalMilkLiters, base.summary.totalMilkLiters),
    herdDeltaPct: safePct(scenario.summary.finalHerd, base.summary.finalHerd),
    costPerLiterDelta: scenario.summary.avgCostPerLiter - base.summary.avgCostPerLiter,
    minBcs: Number.isFinite(minBcs) ? minBcs : 0,
    underfedMonths,
    monthsInsolvent: scenario.summary.monthsInsolvent,
    worseThanBase: equityDelta < 0,
  };
}
