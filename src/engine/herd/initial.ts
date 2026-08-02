import type { Assumptions } from '../types';
import {
  COW_GEST,
  COW_SLOTS,
  COW_STATES,
  GESTATION_MONTHS,
  HEIFER_PREG_STATES,
  HerdState,
  MAX_DIM,
  MAX_DSM,
  MAX_HEIFER_AGE,
  MAX_MALE_AGE,
  PARITY_BUCKETS,
  cowIndex,
  createHerdState,
  dryslot,
  isDrySlot,
  pregIndex,
} from './cohorts';

/** Reparto del hato de vacas entre buckets de parto, coherente con ~20% de reposición anual. */
const PARITY_MIX = [0.28, 0.24, 0.2, 0.28];

const TRACE_MONTHS = 90;

interface CycleParams {
  rate: number;
  vwp: number;
  maxLact: number;
  dryAtGest: number;
  maxOpenDry: number;
  afs: number;
}

function cycleParams(a: Assumptions): CycleParams {
  return {
    rate: Math.max(0.01, Math.min(0.95, a.repro.monthlyConceptionRate)),
    vwp: Math.max(0, Math.round(a.repro.voluntaryWaitMonths)),
    maxLact: Math.max(1, Math.round(a.milk.lactationMonths)),
    dryAtGest: Math.max(1, GESTATION_MONTHS - Math.round(a.milk.targetDryMonths)),
    maxOpenDry: Math.max(1, Math.min(MAX_DSM, Math.round(a.repro.maxOpenDryMonths))),
    afs: Math.max(6, Math.round(a.repro.ageFirstServiceMonths)),
  };
}

/**
 * Distribución estacionaria de las vacas por (etapa, gestación).
 *
 * Se obtiene siguiendo a una vaca desde el parto hasta el siguiente y acumulando el tiempo
 * esperado en cada estado: ese tiempo esperado *es* la distribución de equilibrio. Sin esto
 * el hato inicial arranca sincronizado y genera oleadas de partos que se confundirían con el
 * efecto del escenario que el usuario está probando.
 */
function steadyStateCows(p: CycleParams): Float64Array {
  let cur = new Float64Array(COW_STATES);
  const acc = new Float64Array(COW_STATES);
  cur[cowIndex(0, 0, 1)] = 1;

  for (let t = 0; t < TRACE_MONTHS; t++) {
    // La vaca a punto de parir ocupa su estado un mes completo antes de salir del ciclo:
    // se contabiliza y recién entonces se retira.
    let alive = 0;
    for (let slot = 0; slot < COW_SLOTS; slot++) {
      const idx = cowIndex(slot, GESTATION_MONTHS, 1);
      acc[idx] += cur[idx];
      alive += cur[idx];
      cur[idx] = 0;
    }

    for (let i = 0; i < COW_STATES; i++) alive += cur[i];
    if (alive < 1e-9) break;

    // Secado.
    for (let slot = 0; slot <= MAX_DIM; slot++) {
      for (let g = 0; g < GESTATION_MONTHS; g++) {
        if (!(slot >= p.maxLact - 1 || g >= p.dryAtGest)) continue;
        const idx = cowIndex(slot, g, 1);
        const n = cur[idx];
        if (n <= 0) continue;
        cur[idx] = 0;
        cur[cowIndex(dryslot(0), g, 1)] += n;
      }
    }

    // Descarte de vacas secas que llevan demasiado tiempo vacías: igual que el parto,
    // ocupan el estado el mes en que se las descarta.
    for (let d = p.maxOpenDry; d <= MAX_DSM; d++) {
      const idx = cowIndex(dryslot(d), 0, 1);
      acc[idx] += cur[idx];
      cur[idx] = 0;
    }

    for (let i = 0; i < COW_STATES; i++) acc[i] += cur[i];

    const next = new Float64Array(COW_STATES);
    for (let slot = 0; slot < COW_SLOTS; slot++) {
      const newSlot = isDrySlot(slot)
        ? Math.min(dryslot(MAX_DSM), slot + 1)
        : slot + 1 > MAX_DIM
          ? dryslot(0)
          : slot + 1;
      for (let g = 0; g < COW_GEST; g++) {
        const n = cur[cowIndex(slot, g, 1)];
        if (n <= 0) continue;
        if (g === 0) {
          const eligible = isDrySlot(slot) || slot >= p.vwp;
          const conceived = eligible ? n * p.rate : 0;
          next[cowIndex(newSlot, 1, 1)] += conceived;
          next[cowIndex(newSlot, 0, 1)] += n - conceived;
        } else {
          next[cowIndex(newSlot, Math.min(GESTATION_MONTHS, g + 1), 1)] += n;
        }
      }
    }
    cur = next;
  }

  return acc;
}

/** Distribución estacionaria de las hembras desde el nacimiento hasta el primer parto. */
function steadyStateHeifers(p: CycleParams) {
  let curOpen = new Float64Array(MAX_HEIFER_AGE);
  let curPreg = new Float64Array(HEIFER_PREG_STATES);
  const accOpen = new Float64Array(MAX_HEIFER_AGE);
  const accPreg = new Float64Array(HEIFER_PREG_STATES);
  curOpen[0] = 1;

  const cullAge = Math.max(
    p.afs + 3,
    Math.min(MAX_HEIFER_AGE - GESTATION_MONTHS - 1, p.afs + 15),
  );

  for (let t = 0; t < TRACE_MONTHS; t++) {
    let alive = 0;
    for (let i = 0; i < MAX_HEIFER_AGE; i++) alive += curOpen[i];
    for (let i = 0; i < HEIFER_PREG_STATES; i++) alive += curPreg[i];
    if (alive < 1e-9) break;

    for (let i = 0; i < MAX_HEIFER_AGE; i++) accOpen[i] += curOpen[i];
    for (let i = 0; i < HEIFER_PREG_STATES; i++) accPreg[i] += curPreg[i];

    // Salen del ciclo tras ocupar su estado un mes: la que pare pasa a vaca, la vacía se vende.
    for (let age = 0; age < MAX_HEIFER_AGE; age++) curPreg[pregIndex(age, GESTATION_MONTHS)] = 0;
    for (let age = cullAge; age < MAX_HEIFER_AGE; age++) curOpen[age] = 0;

    const nextOpen = new Float64Array(MAX_HEIFER_AGE);
    const nextPreg = new Float64Array(HEIFER_PREG_STATES);
    for (let age = 0; age < MAX_HEIFER_AGE - 1; age++) {
      const n = curOpen[age];
      if (n > 0) {
        const conceived = age >= p.afs ? n * p.rate : 0;
        nextPreg[pregIndex(age + 1, 1)] += conceived;
        nextOpen[age + 1] += n - conceived;
      }
      for (let g = 1; g < GESTATION_MONTHS; g++) {
        const m = curPreg[pregIndex(age, g)];
        if (m > 0) nextPreg[pregIndex(age + 1, g + 1)] += m;
      }
    }
    curOpen = nextOpen;
    curPreg = nextPreg;
  }

  return { open: accOpen, preg: accPreg };
}

function scaleInto(target: Float64Array, source: Float64Array, total: number, sourceSum: number) {
  if (sourceSum <= 0 || total <= 0) return;
  const k = total / sourceSum;
  for (let i = 0; i < source.length; i++) target[i] += source[i] * k;
}

/**
 * Construye el hato inicial en su distribución de equilibrio, escalada a los totales
 * que declara el usuario.
 */
export function buildInitialHerd(a: Assumptions): HerdState {
  const s = createHerdState();
  const p = cycleParams(a);

  const cowShape = steadyStateCows(p);
  let cowSum = 0;
  for (let i = 0; i < COW_STATES; i++) cowSum += cowShape[i];
  if (cowSum > 0) {
    const k = a.herd.cows / cowSum;
    for (let slot = 0; slot < COW_SLOTS; slot++) {
      for (let g = 0; g < COW_GEST; g++) {
        const n = cowShape[cowIndex(slot, g, 1)];
        if (n <= 0) continue;
        for (let parity = 1; parity <= PARITY_BUCKETS; parity++) {
          s.cows[cowIndex(slot, g, parity)] += n * k * PARITY_MIX[parity - 1];
        }
      }
    }
  }

  const heiferShape = steadyStateHeifers(p);
  let heiferSum = 0;
  for (let i = 0; i < MAX_HEIFER_AGE; i++) heiferSum += heiferShape.open[i];
  for (let i = 0; i < HEIFER_PREG_STATES; i++) heiferSum += heiferShape.preg[i];
  scaleInto(s.heifersOpen, heiferShape.open, a.herd.heifers, heiferSum);
  scaleInto(s.heifersPregnant, heiferShape.preg, a.herd.heifers, heiferSum);

  const saleAge = Math.max(1, Math.min(MAX_MALE_AGE, Math.round(a.policy.maleSaleAgeMonths)));
  for (let age = 0; age < saleAge; age++) s.males[age] = a.herd.males / saleAge;

  s.bulls = a.herd.bulls;
  s.bcs = 3.2;
  s.reserveStockKg = a.feed.reserveCapacityKg * 0.3;

  return s;
}
