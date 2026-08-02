import type { Assumptions } from '../types';
import {
  ADULT_COW_WEIGHT_KG,
  BULL_WEIGHT_KG,
  COW_GEST,
  COW_SLOTS,
  GESTATION_MONTHS,
  HerdState,
  MAX_HEIFER_AGE,
  MAX_MALE_AGE,
  PARITY_BUCKETS,
  femaleWeightKg,
  maleWeightKg,
  pregIndex,
} from '../herd/cohorts';

export const DAYS_PER_MONTH = 30.4;

/** Consumo de mantenimiento como fracción del peso vivo por día. */
const MAINTENANCE_DM_FRACTION = 0.019;
/** Materia seca adicional por litro de leche producido. */
const DM_PER_LITER = 0.32;
/** Sobrecosto energético de animales en crecimiento y en gestación avanzada. */
const GROWTH_UPLIFT = 1.12;
const LATE_GESTATION_UPLIFT = 1.12;
const CONCENTRATE_DM_PCT = 0.88;

export interface DemandBreakdown {
  totalKg: number;
  cowEquivalents: number;
}

/** Demanda mensual de materia seca del hato completo, en kg. */
export function dmDemand(herd: HerdState, litersProducedPotential: number): DemandBreakdown {
  let total = 0;
  let cowEq = 0;

  const maintenance = (weightKg: number) => weightKg * MAINTENANCE_DM_FRACTION * DAYS_PER_MONTH;

  for (let age = 0; age < MAX_HEIFER_AGE; age++) {
    const w = femaleWeightKg(age);
    const base = maintenance(w) * (age < 30 ? GROWTH_UPLIFT : 1);
    const open = herd.heifersOpen[age];
    if (open > 0) {
      total += open * base;
      cowEq += (open * w) / ADULT_COW_WEIGHT_KG;
    }
    for (let g = 1; g <= GESTATION_MONTHS; g++) {
      const n = herd.heifersPregnant[pregIndex(age, g)];
      if (n <= 0) continue;
      total += n * base * (g >= 7 ? LATE_GESTATION_UPLIFT : 1);
      cowEq += (n * w) / ADULT_COW_WEIGHT_KG;
    }
  }

  for (let age = 0; age < MAX_MALE_AGE; age++) {
    const n = herd.males[age];
    if (n <= 0) continue;
    const w = maleWeightKg(age);
    total += n * maintenance(w) * GROWTH_UPLIFT;
    cowEq += (n * w) / ADULT_COW_WEIGHT_KG;
  }

  // Todas las vacas adultas comen igual salvo por la gestación avanzada, así que el
  // mantenimiento se calcula una vez y el número de parto no interviene.
  const cowMaintenance = maintenance(ADULT_COW_WEIGHT_KG);
  for (let slot = 0; slot < COW_SLOTS; slot++) {
    for (let g = 0; g < COW_GEST; g++) {
      const base = (slot * COW_GEST + g) * PARITY_BUCKETS;
      let n = 0;
      for (let p = 0; p < PARITY_BUCKETS; p++) n += herd.cows[base + p];
      if (n <= 0) continue;
      cowEq += n;
      total += n * cowMaintenance * (g >= 7 ? LATE_GESTATION_UPLIFT : 1);
    }
  }

  if (herd.bulls > 0) {
    total += herd.bulls * maintenance(BULL_WEIGHT_KG);
    cowEq += (herd.bulls * BULL_WEIGHT_KG) / ADULT_COW_WEIGHT_KG;
  }

  total += litersProducedPotential * DM_PER_LITER;

  return { totalKg: total, cowEquivalents: cowEq };
}

export interface SupplyResult {
  pastureKg: number;
  concentrateKgAsFed: number;
  concentrateDmKg: number;
  reserveUsedKg: number;
  reserveAddedKg: number;
  purchasedKg: number;
  availableKg: number;
  reserveStockKg: number;
}

/**
 * Resuelve la oferta de materia seca del mes.
 * El excedente de pastura se conserva parcialmente como reserva (silo/heno); el déficit se
 * cubre primero con reserva y luego, si la política lo permite, comprando forraje.
 */
export function dmSupply(
  herd: HerdState,
  demandKg: number,
  litersProducedPotential: number,
  monthOfYear: number,
  a: Assumptions,
): SupplyResult {
  const seasonal = a.feed.seasonalFactor[monthOfYear] ?? 1;
  const grazedHa = a.feed.hectares + a.feed.rentedHectares;
  const pastureKg = Math.max(0, grazedHa * a.feed.dmPerHaMonth * seasonal * a.feed.utilizationPct);

  const concentrateKgAsFed = Math.max(0, litersProducedPotential * a.feed.concentrateKgPerLiter);
  const concentrateDmKg = concentrateKgAsFed * CONCENTRATE_DM_PCT;

  let stock = herd.reserveStockKg;
  let reserveUsedKg = 0;
  let reserveAddedKg = 0;
  let purchasedKg = 0;

  const grazedPlusConcentrate = pastureKg + concentrateDmKg;

  if (grazedPlusConcentrate >= demandKg) {
    const surplus = grazedPlusConcentrate - demandKg;
    const capture = surplus * a.feed.conservationCapturePct;
    reserveAddedKg = Math.max(0, Math.min(capture, a.feed.reserveCapacityKg - stock));
    stock += reserveAddedKg;
  } else {
    const deficit = demandKg - grazedPlusConcentrate;
    reserveUsedKg = Math.min(stock, deficit);
    stock -= reserveUsedKg;
    const remaining = deficit - reserveUsedKg;
    if (a.feed.buyForageOnDeficit && remaining > 0) purchasedKg = remaining;
  }

  const monthlyLoss = 1 - Math.pow(1 - Math.min(0.95, a.feed.reserveLossPct), 1 / 12);
  stock *= 1 - monthlyLoss;

  const availableKg = pastureKg + concentrateDmKg + reserveUsedKg + purchasedKg;

  return {
    pastureKg,
    concentrateKgAsFed,
    concentrateDmKg,
    reserveUsedKg,
    reserveAddedKg,
    purchasedKg,
    availableKg,
    reserveStockKg: stock,
  };
}

export const NBR_MIN = 0.4;
export const NBR_MAX = 1.3;
/** Velocidad de ajuste de la condición corporal hacia su objetivo nutricional. */
export const BCS_ADJUST_RATE = 0.35;

export function nutritionalBalanceRatio(availableKg: number, demandKg: number): number {
  if (demandKg <= 0) return 1;
  return Math.max(NBR_MIN, Math.min(NBR_MAX, availableKg / demandKg));
}
