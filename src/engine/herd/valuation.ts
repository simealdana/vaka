import type { Assumptions } from '../types';
import {
  ADULT_COW_WEIGHT_KG,
  COW_GEST,
  COW_SLOTS,
  GESTATION_MONTHS,
  HerdState,
  MAX_HEIFER_AGE,
  MAX_MALE_AGE,
  PARITY_BUCKETS,
  cowIndex,
  femaleWeightKg,
  isDrySlot,
  maleWeightKg,
  pregIndex,
} from './cohorts';

/** Una vaca en producción vale más que su carne; una vaca seca y vacía es candidata a descarte. */
const MILKING_COW_PREMIUM = 1.25;
const PREGNANT_HEIFER_PREMIUM = 1.2;
const REFERENCE_HEIFER_AGE = 24;

export function heiferMarketValue(age: number, a: Assumptions): number {
  const ratio = femaleWeightKg(age) / femaleWeightKg(REFERENCE_HEIFER_AGE);
  return a.prices.heiferPricePerHead * ratio * a.macro.cattlePriceIndex;
}

export function maleMarketValue(age: number, a: Assumptions): number {
  return maleWeightKg(age) * a.prices.maleSalePricePerKg * a.macro.cattlePriceIndex;
}

export function cullCowValue(a: Assumptions): number {
  return ADULT_COW_WEIGHT_KG * a.prices.cullCowPricePerKg * a.macro.cattlePriceIndex;
}

export interface HerdValue {
  market: number;
  book: number;
}

export function herdValue(h: HerdState, a: Assumptions): HerdValue {
  let market = 0;
  let book = 0;

  for (let age = 0; age < MAX_HEIFER_AGE; age++) {
    const open = h.heifersOpen[age];
    const bookPerHead =
      a.prices.bookValueHeiferPerHead * Math.min(1, age / REFERENCE_HEIFER_AGE);
    if (open > 0) {
      market += open * heiferMarketValue(age, a);
      book += open * bookPerHead;
    }
    for (let g = 1; g <= GESTATION_MONTHS; g++) {
      const n = h.heifersPregnant[pregIndex(age, g)];
      if (n <= 0) continue;
      market += n * heiferMarketValue(age, a) * PREGNANT_HEIFER_PREMIUM;
      book += n * a.prices.bookValueHeiferPerHead;
    }
  }

  for (let age = 0; age < MAX_MALE_AGE; age++) {
    const n = h.males[age];
    if (n <= 0) continue;
    market += n * maleMarketValue(age, a);
    book += n * a.prices.bookValueHeiferPerHead * Math.min(1, age / 12) * 0.9;
  }

  const cull = cullCowValue(a);
  for (let slot = 0; slot < COW_SLOTS; slot++) {
    const dry = isDrySlot(slot);
    for (let g = 0; g < COW_GEST; g++) {
      const productive = !dry || g > 0;
      const perHead = cull * (productive ? MILKING_COW_PREMIUM : 1);
      for (let p = 1; p <= PARITY_BUCKETS; p++) {
        const n = h.cows[cowIndex(slot, g, p)];
        if (n <= 0) continue;
        market += n * perHead;
        book += n * a.prices.bookValueCowPerHead;
      }
    }
  }

  const bullValue = a.prices.bullPricePerHead * a.macro.cattlePriceIndex;
  market += h.bulls * bullValue;
  book += h.bulls * a.prices.bullPricePerHead;

  return { market, book };
}
