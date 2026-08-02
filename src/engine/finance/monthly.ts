import type { Assumptions, MonthlyResult } from '../types';

export interface FinancialState {
  cash: number;
  debtBalance: number;
  fixedAssetsGross: number;
  fixedAssetsAccumDep: number;
  monthlyDepreciation: number;
  capitalCallCumulative: number;
  cumulativeOperatingCash: number;
  cumulativeEbitda: number;
  cumulativeNetIncome: number;
  capexTotal: number;
}

export interface FinanceInputs {
  month: number;
  litersSold: number;
  animalRevenue: { males: number; cull: number; heifers: number };
  animalPurchases: number;
  capexThisMonth: number;
  feed: { concentrateKgAsFed: number; purchasedKg: number };
  vetUnits: { cows: number; young: number; mastitisCases: number; services: number };
  herdValue: { market: number; book: number };
}

export interface MilkRevenue {
  milk: number;
  cheese: number;
  litersIndustry: number;
  litersDirect: number;
  litersCheese: number;
  cheeseProcessCost: number;
}

/** Reparte los litros vendibles entre canales y calcula el ingreso de cada uno. */
export function milkRevenue(litersSold: number, a: Assumptions): MilkRevenue {
  const shares = [a.channels.industryShare, a.channels.directShare, a.channels.cheeseShare];
  const total = shares.reduce((s, v) => s + Math.max(0, v), 0);
  const norm = total > 0 ? shares.map((v) => Math.max(0, v) / total) : [1, 0, 0];

  let litersDirect = Math.min(litersSold * norm[1], a.channels.directMaxLitersMonth);
  const litersCheese = litersSold * norm[2];
  // Lo que no cabe en venta directa se desvía a la industria.
  let litersIndustry = litersSold - litersDirect - litersCheese;
  if (litersIndustry < 0) {
    litersDirect += litersIndustry;
    litersIndustry = 0;
  }

  const p = a.milk.priceIndex;
  const industry = litersIndustry * a.channels.industryPricePerLiter * (1 + a.milk.qualityBonusPct) * p;
  const direct = litersDirect * a.channels.directPricePerLiter * p;
  const cheeseKg = a.channels.litersPerKgCheese > 0 ? litersCheese / a.channels.litersPerKgCheese : 0;
  const cheese = cheeseKg * a.channels.cheesePricePerKg * p;
  const cheeseProcessCost = cheeseKg * a.channels.cheeseProcessCostPerKg;

  return {
    milk: industry + direct,
    cheese,
    litersIndustry,
    litersDirect,
    litersCheese,
    cheeseProcessCost,
  };
}

/** Cuota mensual de un préstamo con amortización francesa. */
export function frenchPayment(principal: number, annualRate: number, termMonths: number): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const r = annualRate / 12;
  if (r <= 0) return principal / termMonths;
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

export interface FinanceOutcome {
  pnl: MonthlyResult['pnl'];
  cash: MonthlyResult['cash'];
  balance: MonthlyResult['balance'];
  revenueTotal: number;
  cashBeforeFinancing: number;
}

/**
 * Convierte el resultado biológico del mes en P&L, caja y balance.
 * `capitalCall` se pasa desde fuera para que el motor pueda hacer una primera pasada sin
 * aporte, decidir si vende animales, y recalcular.
 */
export function computeFinance(
  fin: FinancialState,
  input: FinanceInputs,
  a: Assumptions,
  capitalCall: number,
  debtPayment: { interest: number; principal: number },
): FinanceOutcome {
  const inflation = Math.pow(1 + a.macro.costInflationAnnual, input.month / 12);
  const rev = milkRevenue(input.litersSold, a);

  const revenueMilk = rev.milk;
  const revenueCheese = rev.cheese;
  const revenueMales = input.animalRevenue.males;
  const revenueCull = input.animalRevenue.cull;
  const revenueHeifers = input.animalRevenue.heifers;
  const revenueTotal = revenueMilk + revenueCheese + revenueMales + revenueCull + revenueHeifers;

  const costFeed =
    (input.feed.concentrateKgAsFed * a.feed.concentrateCostPerKg +
      input.feed.purchasedKg * a.feed.purchasedForageCostPerKgDm +
      (a.feed.fertilizerCostPerHaYear * a.feed.hectares) / 12) *
    inflation;

  const costHealth =
    ((a.health.vetCostPerCowYear * input.vetUnits.cows) / 12 +
      (a.health.vetCostPerYoungYear * input.vetUnits.young) / 12 +
      input.vetUnits.mastitisCases * a.health.mastitisTreatmentCost +
      input.vetUnits.services * a.repro.aiSharePct * a.repro.aiCostPerService) *
    inflation;

  const costPayroll = a.costs.employees * a.costs.salaryMonthly * inflation;
  const costMaintenance = a.costs.maintenanceMonthly * inflation;
  const costLogistics =
    input.litersSold *
    (a.costs.transportPerLiter + a.costs.coolingPerLiter) *
    a.macro.fuelIndex *
    inflation;
  const costLand = ((a.feed.rentedHectares * a.feed.rentedHaCostPerYear) / 12) * inflation;
  const costOther =
    a.costs.overheadMonthly * inflation + revenueTotal * a.costs.lossPct + rev.cheeseProcessCost * inflation;

  const costTotal =
    costFeed + costHealth + costPayroll + costMaintenance + costLogistics + costLand + costOther;

  const ebitda = revenueTotal - costTotal;
  const depreciation = fin.monthlyDepreciation;
  const interest = debtPayment.interest;
  const preTax = ebitda - depreciation - interest;
  const taxes = preTax > 0 ? preTax * a.capital.taxRate : 0;
  const netIncome = preTax - taxes;

  const operating = ebitda - interest - taxes;
  const investing = -(input.capexThisMonth + input.animalPurchases);
  const financing = capitalCall - debtPayment.principal;
  const net = operating + investing + financing;

  const cashBeforeFinancing = fin.cash + operating + investing;
  const balanceCash = fin.cash + net;

  const fixedAssetsNet = Math.max(
    0,
    fin.fixedAssetsGross + input.capexThisMonth - (fin.fixedAssetsAccumDep + depreciation),
  );
  const land = a.capital.landHectares * a.capital.landPricePerHa;
  const debt = Math.max(0, fin.debtBalance - debtPayment.principal);

  const bookEquity = balanceCash + input.herdValue.book + fixedAssetsNet + land - debt;
  const haircut = 1 - a.prices.liquidationHaircutPct;
  const liquidationEquity =
    balanceCash + input.herdValue.market * haircut + fixedAssetsNet * haircut + land * haircut - debt;

  return {
    revenueTotal,
    cashBeforeFinancing,
    pnl: {
      revenueMilk,
      revenueCheese,
      revenueMales,
      revenueCull,
      revenueHeifers,
      revenueTotal,
      costFeed,
      costHealth,
      costPayroll,
      costMaintenance,
      costLogistics,
      costLand,
      costOther,
      costTotal,
      ebitda,
      depreciation,
      interest,
      taxes,
      netIncome,
    },
    cash: {
      operating,
      investing,
      financing,
      net,
      balance: balanceCash,
      capitalCall,
      capitalCallCumulative: fin.capitalCallCumulative + capitalCall,
      debtBalance: debt,
    },
    balance: {
      herdValueMarket: input.herdValue.market,
      herdValueBook: input.herdValue.book,
      fixedAssetsNet,
      land,
      cash: balanceCash,
      debt,
      bookEquity,
      liquidationEquity,
    },
  };
}
