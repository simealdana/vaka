import type { Assumptions } from './types';

/**
 * Escenario base: finca de doble propósito en los llanos venezolanos.
 * Mestizo cebú-lechero, becerro al pie con amamantamiento restringido, pastoreo de
 * Brachiaria con estación seca marcada de noviembre a abril, ordeño manual.
 * Todas las cifras en USD.
 */
export const DEFAULT_ASSUMPTIONS: Assumptions = {
  horizonMonths: 120,
  startMonthOfYear: 0,

  // La finca de ejemplo ya es del productor, así que la TIR sale contra su valor de
  // liquidación. Los costos quedan cargados y coherentes con los activos para que
  // encender `isPurchase` no exija recapturar todo a mano.
  acquisition: {
    isPurchase: false,
    landCost: 153000,
    herdCost: 95000,
    infrastructureCost: 85000,
    closingCost: 6000,
  },

  herd: {
    cows: 55,
    heifers: 45,
    males: 14,
    bulls: 2,
  },

  milk: {
    litersPerCowDay: 8,
    // Tope de lactancia, no duración fija: la lactancia real la determina la reproducción,
    // porque la vaca se seca al alcanzar el mes de gestación objetivo.
    lactationMonths: 12,
    targetDryMonths: 3,
    calfMilkLitersPerDay: 3,
    weaningAgeMonths: 8,
    shrinkPct: 0.02,
    rejectPct: 0.015,
    parityFactor: [0.85, 1.0, 1.08, 1.02],
    priceIndex: 1,
    qualityBonusPct: 0.03,
    heatStressByMonth: [0.97, 0.95, 0.93, 0.94, 1.0, 1.03, 1.04, 1.03, 1.02, 1.0, 0.98, 0.97],
  },

  channels: {
    industryShare: 0.7,
    industryPricePerLiter: 0.62,
    directShare: 0.1,
    directPricePerLiter: 0.95,
    directMaxLitersMonth: 2500,
    cheeseShare: 0.2,
    litersPerKgCheese: 8,
    cheesePricePerKg: 6.2,
    cheeseProcessCostPerKg: 1.1,
  },

  repro: {
    monthlyConceptionRate: 0.22,
    ageFirstServiceMonths: 24,
    voluntaryWaitMonths: 2,
    abortionRatePerPregnancy: 0.04,
    stillbirthRate: 0.04,
    femaleBirthRatio: 0.485,
    cowsPerBull: 25,
    maxOpenDryMonths: 4,
    aiSharePct: 0,
    aiCostPerService: 18,
  },

  health: {
    calfMortalityToWeaning: 0.06,
    heiferMortalityAnnual: 0.03,
    cowMortalityAnnual: 0.035,
    mastitisIncidenceAnnual: 0.15,
    mastitisMilkLossPct: 0.35,
    mastitisTreatmentCost: 35,
    vetCostPerCowYear: 45,
    vetCostPerYoungYear: 22,
  },

  feed: {
    hectares: 85,
    rentedHectares: 0,
    rentedHaCostPerYear: 45,
    dmPerHaMonth: 780,
    // Estación seca noviembre-abril; media anual normalizada a 1.
    seasonalFactor: [0.49, 0.38, 0.33, 0.49, 1.14, 1.57, 1.63, 1.57, 1.52, 1.36, 0.92, 0.6],
    utilizationPct: 0.52,
    concentrateKgPerLiter: 0.15,
    concentrateCostPerKg: 0.52,
    fertilizerCostPerHaYear: 60,
    reserveCapacityKg: 150000,
    reserveLossPct: 0.1,
    conservationCapturePct: 0.4,
    purchasedForageCostPerKgDm: 0.18,
    buyForageOnDeficit: true,
    response: {
      // Relación oferta/demanda de materia seca contra producción de leche.
      nbrToMilk: {
        x: [0.4, 0.6, 0.75, 0.9, 1.0, 1.15, 1.3],
        y: [0.5, 0.66, 0.81, 0.94, 1.0, 1.05, 1.07],
      },
      // Condición corporal de equilibrio a la que tiende el hato con ese plano nutricional.
      nbrToBcsTarget: {
        x: [0.4, 0.6, 0.75, 0.9, 1.0, 1.15, 1.3],
        y: [1.5, 2.0, 2.5, 2.95, 3.2, 3.45, 3.6],
      },
      bcsToConception: {
        x: [1, 2, 2.5, 3, 3.5, 4, 5],
        y: [0.15, 0.45, 0.75, 0.98, 1.05, 1.0, 0.85],
      },
      bcsToMortality: {
        x: [1, 2, 2.5, 3, 3.5, 4, 5],
        y: [4.0, 2.0, 1.35, 1.0, 0.9, 0.9, 1.0],
      },
    },
  },

  costs: {
    employees: 4,
    salaryMonthly: 220,
    maintenanceMonthly: 350,
    transportPerLiter: 0.025,
    coolingPerLiter: 0.015,
    overheadMonthly: 400,
    lossPct: 0.02,
  },

  capital: {
    initialCash: 25000,
    landHectares: 85,
    landPricePerHa: 1800,
    fixedAssetsValue: 85000,
    fixedAssetsLifeYears: 12,
    fixedAssetsSalvagePct: 0.15,
    debtPrincipal: 0,
    debtAnnualRate: 0.14,
    debtTermMonths: 60,
    minCashBuffer: 5000,
    discountRateAnnual: 0.12,
    taxRate: 0,
    capex: [{ label: 'Ampliación de la sala de ordeño', month: 24, amount: 18000, lifeYears: 12 }],
  },

  prices: {
    cullCowPricePerKg: 2.1,
    maleSalePricePerKg: 2.45,
    heiferPricePerHead: 900,
    bullPricePerHead: 1800,
    liquidationHaircutPct: 0.12,
    bookValueHeiferPerHead: 480,
    bookValueCowPerHead: 850,
  },

  macro: {
    costInflationAnnual: 0.03,
    cattlePriceIndex: 1,
    fuelIndex: 1,
  },

  policy: {
    retainAllHeifers: true,
    heiferSaleSharePct: 0.5,
    // Capacidad de carga de las 85 ha: 85 × 780 kg MS × 52% ÷ ~210 kg MS por cabeza y mes.
    // Por encima de este tope la finca compra forraje todo el año y el margen por litro se hunde.
    targetHerdSize: 165,
    maleSaleAgeMonths: 9,
    matureCullRateAtDryoff: 0.1,
    destockOnCashTrigger: true,
    capitalCallEnabled: true,
  },
};

export function cloneAssumptions(a: Assumptions): Assumptions {
  return structuredClone(a);
}
