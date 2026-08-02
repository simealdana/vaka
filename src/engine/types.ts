/** Ruta punteada a un parámetro numérico de Assumptions, ej. "milk.priceIndex". */
export type ParamPath = string;

export interface ResponseTable {
  x: number[];
  y: number[];
}

export interface CapexItem {
  label: string;
  month: number;
  amount: number;
  lifeYears: number;
}

/**
 * Lo que costó montar la finca, que no es lo mismo que lo que vale.
 * En modo compra la TIR se mide contra el desembolso real; en modo poseído se mide
 * contra el valor de liquidación de lo que ya tienes, que es un costo de oportunidad.
 */
export interface Acquisition {
  isPurchase: boolean;
  landCost: number;
  herdCost: number;
  infrastructureCost: number;
  /** Notaría, comisiones, honorarios: se desembolsa pero no crea activo. */
  closingCost: number;
}

export interface Assumptions {
  horizonMonths: number;
  startMonthOfYear: number;

  acquisition: Acquisition;

  herd: {
    cows: number;
    heifers: number;
    males: number;
    bulls: number;
  };

  milk: {
    litersPerCowDay: number;
    lactationMonths: number;
    targetDryMonths: number;
    calfMilkLitersPerDay: number;
    weaningAgeMonths: number;
    shrinkPct: number;
    rejectPct: number;
    parityFactor: number[];
    priceIndex: number;
    qualityBonusPct: number;
    heatStressByMonth: number[];
  };

  channels: {
    industryShare: number;
    industryPricePerLiter: number;
    directShare: number;
    directPricePerLiter: number;
    directMaxLitersMonth: number;
    cheeseShare: number;
    litersPerKgCheese: number;
    cheesePricePerKg: number;
    cheeseProcessCostPerKg: number;
  };

  repro: {
    monthlyConceptionRate: number;
    ageFirstServiceMonths: number;
    voluntaryWaitMonths: number;
    abortionRatePerPregnancy: number;
    stillbirthRate: number;
    femaleBirthRatio: number;
    cowsPerBull: number;
    maxOpenDryMonths: number;
    aiSharePct: number;
    aiCostPerService: number;
  };

  health: {
    calfMortalityToWeaning: number;
    heiferMortalityAnnual: number;
    cowMortalityAnnual: number;
    mastitisIncidenceAnnual: number;
    mastitisMilkLossPct: number;
    mastitisTreatmentCost: number;
    vetCostPerCowYear: number;
    vetCostPerYoungYear: number;
  };

  feed: {
    hectares: number;
    rentedHectares: number;
    rentedHaCostPerYear: number;
    dmPerHaMonth: number;
    seasonalFactor: number[];
    utilizationPct: number;
    concentrateKgPerLiter: number;
    concentrateCostPerKg: number;
    fertilizerCostPerHaYear: number;
    reserveCapacityKg: number;
    reserveLossPct: number;
    conservationCapturePct: number;
    purchasedForageCostPerKgDm: number;
    buyForageOnDeficit: boolean;
    response: {
      nbrToMilk: ResponseTable;
      nbrToBcsTarget: ResponseTable;
      bcsToConception: ResponseTable;
      bcsToMortality: ResponseTable;
    };
  };

  costs: {
    employees: number;
    salaryMonthly: number;
    maintenanceMonthly: number;
    transportPerLiter: number;
    coolingPerLiter: number;
    overheadMonthly: number;
    lossPct: number;
  };

  capital: {
    initialCash: number;
    landHectares: number;
    landPricePerHa: number;
    fixedAssetsValue: number;
    fixedAssetsLifeYears: number;
    fixedAssetsSalvagePct: number;
    debtPrincipal: number;
    debtAnnualRate: number;
    debtTermMonths: number;
    minCashBuffer: number;
    discountRateAnnual: number;
    taxRate: number;
    capex: CapexItem[];
  };

  prices: {
    cullCowPricePerKg: number;
    maleSalePricePerKg: number;
    heiferPricePerHead: number;
    bullPricePerHead: number;
    liquidationHaircutPct: number;
    bookValueHeiferPerHead: number;
    bookValueCowPerHead: number;
  };

  macro: {
    costInflationAnnual: number;
    cattlePriceIndex: number;
    fuelIndex: number;
  };

  policy: {
    retainAllHeifers: boolean;
    heiferSaleSharePct: number;
    targetHerdSize: number;
    maleSaleAgeMonths: number;
    matureCullRateAtDryoff: number;
    destockOnCashTrigger: boolean;
    capitalCallEnabled: boolean;
  };
}

export type OverrideOp = 'multiply' | 'set' | 'add' | 'pctDelta';

export interface ScenarioOverride {
  id: string;
  label: string;
  target: ParamPath;
  op: OverrideOp;
  value: number;
  /** Mes 0-indexado en que arranca el efecto. */
  startMonth: number;
  /** Number.POSITIVE_INFINITY = permanente. */
  durationMonths: number;
  rampInMonths?: number;
  recovery?: {
    type: 'none' | 'immediate' | 'linear' | 'exponential';
    months: number;
  };
  repeat?: { everyMonths: number; times: number };
  priority?: number;
}

export interface HerdSnapshot {
  total: number;
  calvesFemale: number;
  calvesMale: number;
  heifersRearing: number;
  heifersPregnant: number;
  cowsMilking: number;
  cowsDry: number;
  bulls: number;
  malesGrowing: number;
  cowEquivalents: number;
}

export interface MonthlyResult {
  month: number;
  monthOfYear: number;

  herd: HerdSnapshot;

  flows: {
    birthsFemale: number;
    birthsMale: number;
    stillbirths: number;
    abortions: number;
    conceptions: number;
    deathsCalves: number;
    deathsHeifers: number;
    deathsCows: number;
    deathsBulls: number;
    culledCows: number;
    soldMales: number;
    soldHeifers: number;
    boughtHeifers: number;
    boughtBulls: number;
  };

  repro: {
    pregnancyRatePct: number;
    calvings: number;
    bullDeficit: number;
  };

  milk: {
    litersProduced: number;
    litersToCalves: number;
    litersDiscarded: number;
    litersSold: number;
    litersPerCowDay: number;
    avgDim: number;
  };

  feed: {
    dmDemandKg: number;
    dmPastureKg: number;
    dmReserveUsedKg: number;
    dmConcentrateKg: number;
    dmPurchasedKg: number;
    reserveStockKg: number;
    nbr: number;
    bcs: number;
  };

  pnl: {
    revenueMilk: number;
    revenueCheese: number;
    revenueMales: number;
    revenueCull: number;
    revenueHeifers: number;
    revenueTotal: number;
    costFeed: number;
    costHealth: number;
    costPayroll: number;
    costMaintenance: number;
    costLogistics: number;
    costLand: number;
    costOther: number;
    costTotal: number;
    ebitda: number;
    depreciation: number;
    interest: number;
    taxes: number;
    netIncome: number;
  };

  cash: {
    operating: number;
    investing: number;
    financing: number;
    net: number;
    balance: number;
    capitalCall: number;
    capitalCallCumulative: number;
    debtBalance: number;
  };

  balance: {
    herdValueMarket: number;
    herdValueBook: number;
    fixedAssetsNet: number;
    land: number;
    cash: number;
    debt: number;
    bookEquity: number;
    liquidationEquity: number;
  };

  flags: {
    cashBelowBuffer: boolean;
    insolvent: boolean;
    forcedDestock: boolean;
    underfed: boolean;
    bullShortage: boolean;
  };
}

export interface SimulationSummary {
  /** Desembolso propio en el mes 0: contra esto se miden la TIR y el VPN. */
  initialInvestment: number;
  /** Total pagado por los activos más los gastos de cierre. 0 si la finca ya era tuya. */
  acquisitionCost: number;
  /** Valor de mercado de lo adquirido menos lo pagado: positivo es comprar por debajo. */
  entryGain: number;
  /** Desembolso inicial más todo el capital que hubo que inyectar después. */
  totalCapitalRequired: number;
  finalBookEquity: number;
  finalLiquidationEquity: number;
  equityByYear: Record<number, number>;
  irrAnnual: number | null;
  npv: number;
  breakevenMonth: number | null;
  worstCashBalance: number;
  worstCashMonth: number;
  maxCapitalRequired: number;
  totalCapitalCalled: number;
  monthsInsolvent: number;
  firstInsolventMonth: number | null;
  totalMilkLiters: number;
  avgCostPerLiter: number;
  avgMarginPerLiter: number;
  peakHerd: number;
  finalHerd: number;
  finalCowsMilking: number;
  cumulativeEbitda: number;
  cumulativeNetIncome: number;
  cumulativeOperatingCash: number;
  capexTotal: number;
}

export interface EngineWarning {
  code: string;
  message: string;
  month?: number;
}

export interface SimulationOutput {
  months: MonthlyResult[];
  summary: SimulationSummary;
  warnings: EngineWarning[];
}
