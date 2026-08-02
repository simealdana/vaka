export const MAX_HEIFER_AGE = 48;
export const MAX_MALE_AGE = 36;
export const GESTATION_MONTHS = 9;

/** Slots de vaca adulta: 0..24 = meses en leche, 25..31 = meses de seca. */
export const MAX_DIM = 24;
export const DRY_SLOT_BASE = 25;
export const MAX_DSM = 6;
export const COW_SLOTS = DRY_SLOT_BASE + MAX_DSM + 1;
export const COW_GEST = GESTATION_MONTHS + 1;
export const PARITY_BUCKETS = 4;
export const COW_STATES = COW_SLOTS * COW_GEST * PARITY_BUCKETS;

export const cowIndex = (slot: number, gest: number, parity: number): number =>
  (slot * COW_GEST + gest) * PARITY_BUCKETS + (parity - 1);

export const dryslot = (dsm: number): number => DRY_SLOT_BASE + dsm;
export const isDrySlot = (slot: number): boolean => slot >= DRY_SLOT_BASE;

/** Índice de heifer preñada: edad en meses × 10 + mes de gestación (1..9). */
export const HEIFER_PREG_STATES = MAX_HEIFER_AGE * COW_GEST;
export const pregIndex = (age: number, gest: number): number => age * COW_GEST + gest;

export interface HerdState {
  /** Hembras nacidas que aún no han parido, no preñadas. Índice = edad en meses. */
  heifersOpen: Float64Array;
  /** Hembras nulíparas preñadas. Índice = pregIndex(edad, gestación). */
  heifersPregnant: Float64Array;
  /** Machos por edad en meses. */
  males: Float64Array;
  /** Vacas que ya parieron. Índice = cowIndex(slot, gest, parity). */
  cows: Float64Array;
  bulls: number;
  bcs: number;
  reserveStockKg: number;
  underfedStreak: number;
}

export function createHerdState(): HerdState {
  return {
    heifersOpen: new Float64Array(MAX_HEIFER_AGE),
    heifersPregnant: new Float64Array(HEIFER_PREG_STATES),
    males: new Float64Array(MAX_MALE_AGE),
    cows: new Float64Array(COW_STATES),
    bulls: 0,
    bcs: 3,
    reserveStockKg: 0,
    underfedStreak: 0,
  };
}

export function cloneHerdState(s: HerdState): HerdState {
  return {
    heifersOpen: Float64Array.from(s.heifersOpen),
    heifersPregnant: Float64Array.from(s.heifersPregnant),
    males: Float64Array.from(s.males),
    cows: Float64Array.from(s.cows),
    bulls: s.bulls,
    bcs: s.bcs,
    reserveStockKg: s.reserveStockKg,
    underfedStreak: s.underfedStreak,
  };
}

export function sum(a: Float64Array): number {
  let t = 0;
  for (let i = 0; i < a.length; i++) t += a[i];
  return t;
}

export function countCows(cows: Float64Array, wantDry: boolean): number {
  let t = 0;
  for (let slot = 0; slot < COW_SLOTS; slot++) {
    if (isDrySlot(slot) !== wantDry) continue;
    const base = slot * COW_GEST * PARITY_BUCKETS;
    for (let i = base; i < base + COW_GEST * PARITY_BUCKETS; i++) t += cows[i];
  }
  return t;
}

export function countHeifersByAge(
  heifersOpen: Float64Array,
  heifersPregnant: Float64Array,
  fromAge: number,
  toAge: number,
): number {
  let t = 0;
  for (let age = fromAge; age < toAge && age < MAX_HEIFER_AGE; age++) {
    t += heifersOpen[age];
    for (let g = 1; g <= GESTATION_MONTHS; g++) t += heifersPregnant[pregIndex(age, g)];
  }
  return t;
}

export function countPregnantHeifers(heifersPregnant: Float64Array): number {
  return sum(heifersPregnant);
}

/** Peso vivo de una hembra según edad, interpolación lineal por tramos (mestizo doble propósito). */
const FEMALE_WEIGHT_AGES = [0, 8, 12, 18, 24, 36, 48];
const FEMALE_WEIGHT_KG = [32, 110, 155, 230, 295, 385, 430];

const MALE_WEIGHT_AGES = [0, 8, 12, 18, 24, 36];
const MALE_WEIGHT_KG = [34, 130, 185, 275, 355, 460];

function interpBreakpoints(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  const last = xs.length - 1;
  if (x >= xs[last]) return ys[last];
  let i = 0;
  while (i < last && xs[i + 1] < x) i++;
  const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
  return ys[i] + t * (ys[i + 1] - ys[i]);
}

export const femaleWeightKg = (ageMonths: number): number =>
  interpBreakpoints(FEMALE_WEIGHT_AGES, FEMALE_WEIGHT_KG, ageMonths);

export const maleWeightKg = (ageMonths: number): number =>
  interpBreakpoints(MALE_WEIGHT_AGES, MALE_WEIGHT_KG, ageMonths);

export const ADULT_COW_WEIGHT_KG = 430;
export const BULL_WEIGHT_KG = 620;

/** Interpolación lineal sobre una tabla de respuesta monótona, con extremos planos. */
export function interpTable(table: { x: number[]; y: number[] }, x: number): number {
  return interpBreakpoints(table.x, table.y, x);
}
