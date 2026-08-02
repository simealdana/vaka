import { buildInitialHerd } from './herd/initial';
import { herdValue } from './herd/valuation';
import type { FinancialState } from './finance/monthly';
import { annualizeMonthlyRate, irrMonthly, npv } from './finance/metrics';
import { assumptionsAt, resolveTimelines } from './scenario/resolve';
import { createSimState, stepMonth } from './tick';
import type {
  Assumptions,
  EngineWarning,
  MonthlyResult,
  ScenarioOverride,
  SimulationOutput,
  SimulationSummary,
} from './types';

export interface SimulateOptions {
  /** Omite el detalle mensual y devuelve solo el resumen; usado por Monte Carlo. */
  summaryOnly?: boolean;
}

function initialFinancialState(a: Assumptions): FinancialState {
  const depreciableBase = a.capital.fixedAssetsValue * (1 - a.capital.fixedAssetsSalvagePct);
  return {
    cash: a.capital.initialCash,
    debtBalance: a.capital.debtPrincipal,
    fixedAssetsGross: a.capital.fixedAssetsValue,
    fixedAssetsAccumDep: 0,
    monthlyDepreciation: depreciableBase / (Math.max(1, a.capital.fixedAssetsLifeYears) * 12),
    capitalCallCumulative: 0,
    cumulativeOperatingCash: 0,
    cumulativeEbitda: 0,
    cumulativeNetIncome: 0,
    capexTotal: 0,
  };
}

function validate(a: Assumptions): EngineWarning[] {
  const w: EngineWarning[] = [];
  if (a.milk.lactationMonths + a.milk.targetDryMonths > 24) {
    w.push({ code: 'long-cycle', message: 'La lactancia más el período seco superan 24 meses.' });
  }
  if (a.repro.ageFirstServiceMonths > 36) {
    w.push({
      code: 'late-first-service',
      message: 'Edad al primer servicio muy alta: las novillas podrían descartarse antes de preñarse.',
    });
  }
  const shares = a.channels.industryShare + a.channels.directShare + a.channels.cheeseShare;
  if (Math.abs(shares - 1) > 0.01) {
    w.push({
      code: 'channel-shares',
      message: `Los canales de leche suman ${(shares * 100).toFixed(0)}%; se normalizan a 100%.`,
    });
  }
  if (a.herd.cows <= 0) {
    w.push({ code: 'no-cows', message: 'El hato inicial no tiene vacas.' });
  }
  return w;
}

/**
 * Corre la simulación completa mes a mes.
 * Determinista: mismos supuestos y mismos overrides producen exactamente el mismo resultado.
 */
export function simulate(
  base: Assumptions,
  overrides: ScenarioOverride[] = [],
  options: SimulateOptions = {},
): SimulationOutput {
  const horizon = Math.max(1, Math.round(base.horizonMonths));
  const warnings = validate(base);
  const timelines = resolveTimelines(base, overrides, horizon);

  const herd = buildInitialHerd(base);
  const fin = initialFinancialState(base);
  const state = createSimState(herd, fin);

  const months: MonthlyResult[] = [];
  const equityFlows: number[] = [];

  const initialMarketValue =
    base.capital.fixedAssetsValue +
    base.capital.landHectares * base.capital.landPricePerHa +
    herdValue(herd, base).market;

  const acq = base.acquisition;
  const acquisitionCost = acq.isPurchase
    ? acq.landCost + acq.herdCost + acq.infrastructureCost + acq.closingCost
    : 0;

  // Comprando, lo que arriesga el socio es lo que pone de su bolsillo: lo pagado más la
  // caja de arranque, menos lo que financia el banco. Si la finca ya era suya, lo que
  // arriesga es no venderla, así que la referencia es su valor de liquidación.
  const initialInvestment = acq.isPurchase
    ? acquisitionCost + base.capital.initialCash - base.capital.debtPrincipal
    : base.capital.initialCash + initialMarketValue - base.capital.debtPrincipal;

  equityFlows.push(-initialInvestment);

  let worstCashBalance = Number.POSITIVE_INFINITY;
  let worstCashMonth = 0;
  let maxCapitalRequired = 0;
  let monthsInsolvent = 0;
  let firstInsolventMonth: number | null = null;
  let breakevenMonth: number | null = null;
  let totalMilkLiters = 0;
  let totalCost = 0;
  let totalRevenue = 0;
  let peakHerd = 0;
  let positiveEbitdaStreak = 0;

  const equityByYear: Record<number, number> = {};
  let last: MonthlyResult | null = null;

  for (let m = 0; m < horizon; m++) {
    const a = assumptionsAt(base, timelines, m);
    const monthOfYear = (base.startMonthOfYear + m) % 12;
    const r = stepMonth(state, { month: m, monthOfYear, a });

    if (!options.summaryOnly) months.push(r);
    last = r;

    equityFlows.push(-r.cash.capitalCall);

    if (r.cash.balance < worstCashBalance) {
      worstCashBalance = r.cash.balance;
      worstCashMonth = m;
    }
    maxCapitalRequired = Math.max(maxCapitalRequired, r.cash.capitalCallCumulative);
    if (r.flags.insolvent) {
      monthsInsolvent++;
      if (firstInsolventMonth === null) firstInsolventMonth = m;
    }

    positiveEbitdaStreak = r.pnl.ebitda > 0 ? positiveEbitdaStreak + 1 : 0;
    if (
      breakevenMonth === null &&
      positiveEbitdaStreak >= 3 &&
      state.fin.cumulativeOperatingCash > 0
    ) {
      breakevenMonth = m;
    }

    totalMilkLiters += r.milk.litersSold;
    totalCost += r.pnl.costTotal;
    totalRevenue += r.pnl.revenueTotal;
    peakHerd = Math.max(peakHerd, r.herd.total);

    const year = Math.floor((m + 1) / 12);
    if ((m + 1) % 12 === 0) equityByYear[year] = r.balance.bookEquity;
  }

  const finalLiquidation = last ? last.balance.liquidationEquity : initialInvestment;
  equityFlows[equityFlows.length - 1] += finalLiquidation;

  const monthlyIrr = irrMonthly(equityFlows);
  const monthlyDiscount = Math.pow(1 + base.capital.discountRateAnnual, 1 / 12) - 1;

  const summary: SimulationSummary = {
    initialInvestment,
    acquisitionCost,
    entryGain: acq.isPurchase ? initialMarketValue - acquisitionCost : 0,
    totalCapitalRequired: initialInvestment + maxCapitalRequired,
    finalBookEquity: last ? last.balance.bookEquity : initialInvestment,
    finalLiquidationEquity: finalLiquidation,
    equityByYear,
    irrAnnual: monthlyIrr === null ? null : annualizeMonthlyRate(monthlyIrr),
    npv: npv(monthlyDiscount, equityFlows),
    breakevenMonth,
    worstCashBalance: Number.isFinite(worstCashBalance) ? worstCashBalance : 0,
    worstCashMonth,
    maxCapitalRequired,
    totalCapitalCalled: state.fin.capitalCallCumulative,
    monthsInsolvent,
    firstInsolventMonth,
    totalMilkLiters,
    avgCostPerLiter: totalMilkLiters > 0 ? totalCost / totalMilkLiters : 0,
    avgMarginPerLiter: totalMilkLiters > 0 ? (totalRevenue - totalCost) / totalMilkLiters : 0,
    peakHerd,
    finalHerd: last ? last.herd.total : 0,
    finalCowsMilking: last ? last.herd.cowsMilking : 0,
    cumulativeEbitda: state.fin.cumulativeEbitda,
    cumulativeNetIncome: state.fin.cumulativeNetIncome,
    cumulativeOperatingCash: state.fin.cumulativeOperatingCash,
    capexTotal: state.fin.capexTotal,
  };

  return { months, summary, warnings };
}
