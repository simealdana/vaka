import type { Assumptions, SimulationOutput } from '@/engine/types';
import type { Findings } from './metrics';

/**
 * Las seis formas de "perder" del documento. Cada una sale de una fuente distinta:
 * ninguna es la misma cifra con otro nombre, y por eso no suman entre sí.
 */
export interface LossBreakdown {
  /** Caja: cuánto peor queda el punto más bajo del saldo. */
  cash: number;
  /** Contable: diferencia de utilidad neta acumulada, que ya incluye muertes y depreciación. */
  accounting: number;
  /** Patrimonial: diferencia de activos menos pasivos al final del horizonte. */
  equity: number;
  /** Lo que salió de la caja pero sigue en la finca en forma de ganado o instalaciones. */
  convertedToAssets: number;
  herdValueChange: number;
  capex: number;
  /** Lo que ese capital habría rendido en la alternativa, menos lo que rindió aquí. */
  opportunityCost: number;
  /** Novillas equivalentes a la inversión inmovilizada, para poder decirlo en animales. */
  heifersEquivalent: number;
  risk: { monthsInsolvent: number; monthsOfBuffer: number | null; minCash: number };
}

export function classifyLoss(
  base: SimulationOutput,
  scenario: SimulationOutput,
  a: Assumptions,
  findings: Findings,
): LossBreakdown {
  const first = scenario.months[0];
  const last = scenario.months[scenario.months.length - 1];

  const herdValueChange = last && first ? last.balance.herdValueBook - first.balance.herdValueBook : 0;
  const capex = scenario.summary.capexTotal;

  const startingEquity = first?.balance.bookEquity ?? 0;
  const years = scenario.months.length / 12;
  const alternative = startingEquity * (Math.pow(1 + a.capital.discountRateAnnual, years) - 1);
  const realized = scenario.summary.finalBookEquity - startingEquity;

  return {
    cash: findings.cashDelta,
    accounting: scenario.summary.cumulativeNetIncome - base.summary.cumulativeNetIncome,
    equity: findings.equityDelta,
    convertedToAssets: herdValueChange + capex,
    herdValueChange,
    capex,
    opportunityCost: alternative - realized,
    heifersEquivalent:
      a.prices.heiferPricePerHead > 0 ? (herdValueChange + capex) / a.prices.heiferPricePerHead : 0,
    risk: {
      monthsInsolvent: scenario.summary.monthsInsolvent,
      monthsOfBuffer: findings.monthsOfBuffer,
      minCash: scenario.summary.worstCashBalance,
    },
  };
}
