import {
  COW_GEST,
  COW_SLOTS,
  GESTATION_MONTHS,
  HerdState,
  MAX_DIM,
  MAX_DSM,
  MAX_HEIFER_AGE,
  MAX_MALE_AGE,
  PARITY_BUCKETS,
  COW_STATES,
  HEIFER_PREG_STATES,
  cowIndex,
  dryslot,
  interpTable,
  isDrySlot,
  pregIndex,
} from './herd/cohorts';
import { cullCowValue, heiferMarketValue, herdValue, maleMarketValue } from './herd/valuation';
import { lactationShape, parityFactor } from './production/lactation';
import {
  BCS_ADJUST_RATE,
  DAYS_PER_MONTH,
  dmDemand,
  dmSupply,
  nutritionalBalanceRatio,
} from './nutrition/balance';
import {
  FinancialState,
  computeFinance,
  frenchPayment,
} from './finance/monthly';
import type { Assumptions, MonthlyResult } from './types';

export interface SimState {
  herd: HerdState;
  fin: FinancialState;
  conceivedCows: Float64Array;
  conceivedHeifers: Float64Array;
  nextCows: Float64Array;
  nextHeifersOpen: Float64Array;
  nextHeifersPregnant: Float64Array;
  nextMales: Float64Array;
}

export interface TickContext {
  month: number;
  monthOfYear: number;
  a: Assumptions;
}

type Flows = MonthlyResult['flows'];

const annualToMonthly = (annual: number): number =>
  1 - Math.pow(1 - Math.max(0, Math.min(0.99, annual)), 1 / 12);

/** Perfil de riesgo de muerte del becerro: decae con la edad, concentrado en los primeros meses. */
function calfHazardProfile(weaningAge: number): Float64Array {
  const n = Math.max(1, Math.round(weaningAge));
  const w = new Float64Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    w[i] = Math.exp(-0.55 * i);
    total += w[i];
  }
  for (let i = 0; i < n; i++) w[i] /= total;
  return w;
}

function emptyFlows(): Flows {
  return {
    birthsFemale: 0,
    birthsMale: 0,
    stillbirths: 0,
    abortions: 0,
    conceptions: 0,
    deathsCalves: 0,
    deathsHeifers: 0,
    deathsCows: 0,
    deathsBulls: 0,
    culledCows: 0,
    soldMales: 0,
    soldHeifers: 0,
    boughtHeifers: 0,
    boughtBulls: 0,
  };
}

export function snapshotHerd(h: HerdState, a: Assumptions, cowEquivalents: number) {
  const weaning = Math.max(1, Math.round(a.milk.weaningAgeMonths));
  let calvesFemale = 0;
  let heifersRearing = 0;
  let heifersPregnant = 0;
  for (let age = 0; age < MAX_HEIFER_AGE; age++) {
    const open = h.heifersOpen[age];
    if (age < weaning) calvesFemale += open;
    else heifersRearing += open;
    for (let g = 1; g <= GESTATION_MONTHS; g++) heifersPregnant += h.heifersPregnant[pregIndex(age, g)];
  }

  let calvesMale = 0;
  let malesGrowing = 0;
  for (let age = 0; age < MAX_MALE_AGE; age++) {
    if (age < weaning) calvesMale += h.males[age];
    else malesGrowing += h.males[age];
  }

  let cowsMilking = 0;
  let cowsDry = 0;
  for (let slot = 0; slot < COW_SLOTS; slot++) {
    let n = 0;
    const base = slot * COW_GEST * PARITY_BUCKETS;
    for (let i = base; i < base + COW_GEST * PARITY_BUCKETS; i++) n += h.cows[i];
    if (isDrySlot(slot)) cowsDry += n;
    else cowsMilking += n;
  }

  const total =
    calvesFemale + calvesMale + heifersRearing + heifersPregnant + cowsMilking + cowsDry + malesGrowing + h.bulls;

  return {
    total,
    calvesFemale,
    calvesMale,
    heifersRearing,
    heifersPregnant,
    cowsMilking,
    cowsDry,
    bulls: h.bulls,
    malesGrowing,
    cowEquivalents,
  };
}

/** Litros que produciría el hato este mes con nutrición plena. */
function potentialMilk(h: HerdState, a: Assumptions, monthOfYear: number) {
  const lact = Math.max(1, Math.round(a.milk.lactationMonths));
  const shape = lactationShape(lact);
  const heat = a.milk.heatStressByMonth[monthOfYear] ?? 1;
  let liters = 0;
  let dimWeighted = 0;
  let milkingCows = 0;

  for (let slot = 0; slot <= MAX_DIM; slot++) {
    const s = shape[Math.min(slot, shape.length - 1)];
    for (let g = 0; g < COW_GEST; g++) {
      for (let p = 1; p <= PARITY_BUCKETS; p++) {
        const n = h.cows[cowIndex(slot, g, p)];
        if (n <= 0) continue;
        const perCowDay = a.milk.litersPerCowDay * s * parityFactor(a.milk.parityFactor, p) * heat;
        liters += n * perCowDay * DAYS_PER_MONTH;
        dimWeighted += n * slot;
        milkingCows += n;
      }
    }
  }

  return {
    liters: Math.max(0, liters),
    avgDim: milkingCows > 0 ? dimWeighted / milkingCows : 0,
    milkingCows,
  };
}

function culledCowRevenue(n: number, a: Assumptions): number {
  return n * cullCowValue(a);
}

/**
 * Vende animales para cubrir un faltante de caja: primero novillas vacías de más edad,
 * luego vacas secas vacías y por último vacas en producción de más partos.
 * El tope mensual evita que un mes malo liquide el hato completo.
 */
function destock(h: HerdState, neededUsd: number, a: Assumptions, flows: Flows, herdTotal: number) {
  let raised = 0;
  let headSold = 0;
  let heiferRevenue = 0;
  let cullRevenue = 0;
  const maxHead = herdTotal * 0.15;

  for (let age = MAX_HEIFER_AGE - 1; age >= 6 && raised < neededUsd && headSold < maxHead; age--) {
    const available = h.heifersOpen[age];
    if (available <= 0) continue;
    const unit = heiferMarketValue(age, a);
    if (unit <= 0) continue;
    const wanted = Math.min(available, (neededUsd - raised) / unit, maxHead - headSold);
    if (wanted <= 0) continue;
    h.heifersOpen[age] -= wanted;
    raised += wanted * unit;
    heiferRevenue += wanted * unit;
    headSold += wanted;
    flows.soldHeifers += wanted;
  }

  const unitCow = cullCowValue(a);
  if (unitCow > 0) {
    const order: number[] = [];
    for (let d = MAX_DSM; d >= 0; d--) order.push(dryslot(d));
    for (let slot = MAX_DIM; slot >= 0; slot--) order.push(slot);

    for (const slot of order) {
      if (raised >= neededUsd || headSold >= maxHead) break;
      for (let p = PARITY_BUCKETS; p >= 1 && raised < neededUsd && headSold < maxHead; p--) {
        const idx = cowIndex(slot, 0, p);
        const available = h.cows[idx];
        if (available <= 0) continue;
        const wanted = Math.min(available, (neededUsd - raised) / unitCow, maxHead - headSold);
        if (wanted <= 0) continue;
        h.cows[idx] -= wanted;
        raised += wanted * unitCow;
        cullRevenue += wanted * unitCow;
        headSold += wanted;
        flows.culledCows += wanted;
      }
    }
  }

  return { raised, headSold, heiferRevenue, cullRevenue };
}

export function stepMonth(state: SimState, ctx: TickContext): MonthlyResult {
  const { a, month, monthOfYear } = ctx;
  const h = state.herd;
  const flows = emptyFlows();

  const lact = Math.max(1, Math.round(a.milk.lactationMonths));
  const dryAtGest = Math.max(1, GESTATION_MONTHS - Math.round(a.milk.targetDryMonths));
  const weaning = Math.max(1, Math.round(a.milk.weaningAgeMonths));

  // --- Abortos -------------------------------------------------------------
  const monthlyAbortion =
    1 - Math.pow(1 - Math.max(0, Math.min(0.9, a.repro.abortionRatePerPregnancy)), 1 / (GESTATION_MONTHS - 1));

  for (let slot = 0; slot < COW_SLOTS; slot++) {
    for (let g = 1; g < GESTATION_MONTHS; g++) {
      for (let p = 1; p <= PARITY_BUCKETS; p++) {
        const idx = cowIndex(slot, g, p);
        const n = h.cows[idx];
        if (n <= 0) continue;
        const lost = n * monthlyAbortion;
        h.cows[idx] = n - lost;
        h.cows[cowIndex(slot, 0, p)] += lost;
        flows.abortions += lost;
      }
    }
  }
  for (let age = 0; age < MAX_HEIFER_AGE; age++) {
    for (let g = 1; g < GESTATION_MONTHS; g++) {
      const idx = pregIndex(age, g);
      const n = h.heifersPregnant[idx];
      if (n <= 0) continue;
      const lost = n * monthlyAbortion;
      h.heifersPregnant[idx] = n - lost;
      h.heifersOpen[age] += lost;
      flows.abortions += lost;
    }
  }

  // --- Partos --------------------------------------------------------------
  let calvings = 0;
  for (let slot = 0; slot < COW_SLOTS; slot++) {
    for (let p = 1; p <= PARITY_BUCKETS; p++) {
      const idx = cowIndex(slot, GESTATION_MONTHS, p);
      const n = h.cows[idx];
      if (n <= 0) continue;
      h.cows[idx] = 0;
      h.cows[cowIndex(0, 0, Math.min(PARITY_BUCKETS, p + 1))] += n;
      calvings += n;
    }
  }
  for (let age = 0; age < MAX_HEIFER_AGE; age++) {
    const idx = pregIndex(age, GESTATION_MONTHS);
    const n = h.heifersPregnant[idx];
    if (n <= 0) continue;
    h.heifersPregnant[idx] = 0;
    h.cows[cowIndex(0, 0, 1)] += n;
    calvings += n;
  }

  const liveCalves = calvings * (1 - a.repro.stillbirthRate);
  flows.stillbirths = calvings - liveCalves;
  flows.birthsFemale = liveCalves * a.repro.femaleBirthRatio;
  flows.birthsMale = liveCalves - flows.birthsFemale;
  h.heifersOpen[0] += flows.birthsFemale;
  h.males[0] += flows.birthsMale;

  // --- Nutrición -----------------------------------------------------------
  // Se evalúa después de los partos: la vaca que pare este mes ya ordeña y su becerro ya mama.
  const potential = potentialMilk(h, a, monthOfYear);
  const demand = dmDemand(h, potential.liters);
  const supply = dmSupply(h, demand.totalKg, potential.liters, monthOfYear, a);
  const nbr = nutritionalBalanceRatio(supply.availableKg, demand.totalKg);

  const milkMult = interpTable(a.feed.response.nbrToMilk, nbr);
  // La fertilidad y la mortalidad responden a la condición corporal acumulada, no al balance
  // del mes: es lo que introduce el rezago entre una sequía y su efecto reproductivo.
  const conceptionMult = interpTable(a.feed.response.bcsToConception, h.bcs);
  const mortalityMult = interpTable(a.feed.response.bcsToMortality, h.bcs);

  const herdStart = snapshotHerd(h, a, demand.cowEquivalents);

  // --- Leche ---------------------------------------------------------------
  const litersProduced = potential.liters * milkMult;
  const mastitisCases = (herdStart.cowsMilking * a.health.mastitisIncidenceAnnual) / 12;
  const mastitisLossFraction =
    (a.health.mastitisIncidenceAnnual / 12) * a.health.mastitisMilkLossPct;
  const litersMastitis = litersProduced * Math.min(0.9, mastitisLossFraction);

  const nursingCalves = herdStart.calvesFemale + herdStart.calvesMale;
  const litersToCalves = Math.min(
    nursingCalves * a.milk.calfMilkLitersPerDay * DAYS_PER_MONTH,
    litersProduced * 0.6,
  );
  const marketable = Math.max(0, litersProduced - litersToCalves - litersMastitis);
  const litersSold = marketable * (1 - a.milk.shrinkPct) * (1 - a.milk.rejectPct);
  const litersDiscarded = litersProduced - litersToCalves - litersSold;

  // --- Secado y descarte de vacas viejas ------------------------------------
  for (let slot = 0; slot <= MAX_DIM; slot++) {
    for (let g = 0; g < GESTATION_MONTHS; g++) {
      const shouldDry = slot >= lact - 1 || g >= dryAtGest;
      if (!shouldDry) continue;
      for (let p = 1; p <= PARITY_BUCKETS; p++) {
        const idx = cowIndex(slot, g, p);
        const n = h.cows[idx];
        if (n <= 0) continue;
        h.cows[idx] = 0;
        // El descarte voluntario se decide al secado, sobre las vacas de más partos.
        const cull = p === PARITY_BUCKETS ? n * a.policy.matureCullRateAtDryoff : 0;
        flows.culledCows += cull;
        h.cows[cowIndex(dryslot(0), g, p)] += n - cull;
      }
    }
  }

  // --- Mortalidad ----------------------------------------------------------
  const calfProfile = calfHazardProfile(weaning);
  const heiferMonthly = annualToMonthly(a.health.heiferMortalityAnnual) * mortalityMult;
  const cowMonthly = annualToMonthly(a.health.cowMortalityAnnual) * mortalityMult;

  for (let age = 0; age < MAX_HEIFER_AGE; age++) {
    const rate =
      age < weaning
        ? Math.min(0.9, a.health.calfMortalityToWeaning * calfProfile[age] * mortalityMult)
        : heiferMonthly;
    if (rate <= 0) continue;
    const openDeaths = h.heifersOpen[age] * rate;
    h.heifersOpen[age] -= openDeaths;
    if (age < weaning) flows.deathsCalves += openDeaths;
    else flows.deathsHeifers += openDeaths;
    for (let g = 1; g <= GESTATION_MONTHS; g++) {
      const idx = pregIndex(age, g);
      const d = h.heifersPregnant[idx] * rate;
      h.heifersPregnant[idx] -= d;
      flows.deathsHeifers += d;
    }
  }

  for (let age = 0; age < MAX_MALE_AGE; age++) {
    const rate =
      age < weaning
        ? Math.min(0.9, a.health.calfMortalityToWeaning * calfProfile[age] * mortalityMult)
        : heiferMonthly;
    const d = h.males[age] * rate;
    h.males[age] -= d;
    if (age < weaning) flows.deathsCalves += d;
    else flows.deathsHeifers += d;
  }

  for (let i = 0; i < COW_STATES; i++) {
    const n = h.cows[i];
    if (n <= 0) continue;
    const d = n * cowMonthly;
    h.cows[i] = n - d;
    flows.deathsCows += d;
  }

  const bullDeaths = h.bulls * cowMonthly;
  h.bulls -= bullDeaths;
  flows.deathsBulls = bullDeaths;

  // --- Ventas de rutina ----------------------------------------------------
  let revenueMales = 0;
  let revenueCull = 0;
  let revenueHeifers = 0;

  const saleAge = Math.max(1, Math.min(MAX_MALE_AGE - 1, Math.round(a.policy.maleSaleAgeMonths)));
  for (let age = saleAge; age < MAX_MALE_AGE; age++) {
    const n = h.males[age];
    if (n <= 0) continue;
    h.males[age] = 0;
    flows.soldMales += n;
    revenueMales += n * maleMarketValue(age, a);
  }

  // Vacas secas que llevan demasiado tiempo vacías: descarte por infertilidad.
  const maxOpenDry = Math.max(1, Math.min(MAX_DSM, Math.round(a.repro.maxOpenDryMonths)));
  for (let d = maxOpenDry; d <= MAX_DSM; d++) {
    for (let p = 1; p <= PARITY_BUCKETS; p++) {
      const idx = cowIndex(dryslot(d), 0, p);
      const n = h.cows[idx];
      if (n <= 0) continue;
      h.cows[idx] = 0;
      flows.culledCows += n;
    }
  }

  // Novillas que no quedaron preñadas tras una ventana razonable de servicio.
  const afs = Math.max(6, Math.round(a.repro.ageFirstServiceMonths));
  const heiferCullAge = Math.max(
    afs + 3,
    Math.min(MAX_HEIFER_AGE - GESTATION_MONTHS - 1, afs + 15),
  );
  for (let age = heiferCullAge; age < MAX_HEIFER_AGE; age++) {
    const n = h.heifersOpen[age];
    if (n <= 0) continue;
    h.heifersOpen[age] = 0;
    flows.soldHeifers += n;
    revenueHeifers += n * heiferMarketValue(age, a);
  }

  // Venta programada de hembras de reemplazo.
  if (!a.policy.retainAllHeifers) {
    const share = Math.max(0, Math.min(1, a.policy.heiferSaleSharePct));
    const n = h.heifersOpen[weaning] * share;
    if (n > 0) {
      h.heifersOpen[weaning] -= n;
      flows.soldHeifers += n;
      revenueHeifers += n * heiferMarketValue(weaning, a);
    }
  }

  revenueCull += culledCowRevenue(flows.culledCows, a);

  // Reposición de toros para sostener la carga reproductiva.
  let animalPurchases = 0;
  const servedFemalesEstimate = herdStart.cowsMilking + herdStart.cowsDry + herdStart.heifersRearing;
  const bullsNeeded =
    a.repro.cowsPerBull > 0
      ? (servedFemalesEstimate / a.repro.cowsPerBull) * (1 - Math.max(0, Math.min(1, a.repro.aiSharePct)))
      : 0;
  if (h.bulls < bullsNeeded - 0.001) {
    const buy = bullsNeeded - h.bulls;
    h.bulls += buy;
    flows.boughtBulls = buy;
    animalPurchases += buy * a.prices.bullPricePerHead * a.macro.cattlePriceIndex;
  }

  // Freno de crecimiento cuando el hato supera el tamaño objetivo.
  let forcedDestock = false;
  const afterSales = snapshotHerd(h, a, demand.cowEquivalents);
  if (a.policy.targetHerdSize > 0 && afterSales.total > a.policy.targetHerdSize) {
    let excess = afterSales.total - a.policy.targetHerdSize;
    for (let age = MAX_HEIFER_AGE - 1; age >= weaning && excess > 0; age--) {
      const n = Math.min(h.heifersOpen[age], excess);
      if (n <= 0) continue;
      h.heifersOpen[age] -= n;
      excess -= n;
      flows.soldHeifers += n;
      revenueHeifers += n * heiferMarketValue(age, a);
    }
    forcedDestock = true;
  }

  // --- Finanzas ------------------------------------------------------------
  const capexThisMonth = a.capital.capex
    .filter((c) => c.month === month)
    .reduce((s, c) => s + c.amount, 0);

  const payment = frenchPayment(a.capital.debtPrincipal, a.capital.debtAnnualRate, a.capital.debtTermMonths);
  const interest = state.fin.debtBalance * (a.capital.debtAnnualRate / 12);
  const principal = Math.max(0, Math.min(state.fin.debtBalance, payment - interest));
  const debtPayment = { interest, principal };

  const vetUnits = {
    cows: herdStart.cowsMilking + herdStart.cowsDry,
    young: herdStart.calvesFemale + herdStart.calvesMale + herdStart.heifersRearing + herdStart.heifersPregnant + herdStart.malesGrowing,
    mastitisCases,
    services: 0,
  };

  // La valuación solo cambia si se venden animales, así que se recalcula únicamente entonces.
  let hv = herdValue(h, a);
  const buildInputs = (rev: { males: number; cull: number; heifers: number }, purchases: number) => ({
    month,
    litersSold,
    animalRevenue: rev,
    animalPurchases: purchases,
    capexThisMonth,
    feed: { concentrateKgAsFed: supply.concentrateKgAsFed, purchasedKg: supply.purchasedKg },
    vetUnits,
    herdValue: hv,
  });

  let provisional = computeFinance(
    state.fin,
    buildInputs({ males: revenueMales, cull: revenueCull, heifers: revenueHeifers }, animalPurchases),
    a,
    0,
    debtPayment,
  );

  // Segunda pasada: si la caja no alcanza y la política lo permite, se venden animales.
  const shortfall = a.capital.minCashBuffer - provisional.cash.balance;
  if (shortfall > 0 && a.policy.destockOnCashTrigger) {
    const sold = destock(h, shortfall, a, flows, afterSales.total);
    if (sold.headSold > 0) {
      forcedDestock = true;
      revenueHeifers += sold.heiferRevenue;
      revenueCull += sold.cullRevenue;
      hv = herdValue(h, a);
      provisional = computeFinance(
        state.fin,
        buildInputs({ males: revenueMales, cull: revenueCull, heifers: revenueHeifers }, animalPurchases),
        a,
        0,
        debtPayment,
      );
    }
  }

  let capitalCall = 0;
  const gap = a.capital.minCashBuffer - provisional.cash.balance;
  if (gap > 0 && a.policy.capitalCallEnabled) capitalCall = gap;

  const finance =
    capitalCall > 0
      ? computeFinance(
          state.fin,
          buildInputs({ males: revenueMales, cull: revenueCull, heifers: revenueHeifers }, animalPurchases),
          a,
          capitalCall,
          debtPayment,
        )
      : provisional;

  // --- Concepciones --------------------------------------------------------
  // Se procesan al final del mes para que el envejecimiento las lleve al mes 1 de gestación
  // sin que ningún otro paso tenga que distinguir "vacía" de "recién preñada".
  state.conceivedCows.fill(0);
  state.conceivedHeifers.fill(0);

  const vwp = Math.max(0, Math.round(a.repro.voluntaryWaitMonths));
  let eligible = 0;
  for (let slot = 0; slot < COW_SLOTS; slot++) {
    const servable = isDrySlot(slot) || slot >= vwp;
    if (!servable) continue;
    for (let p = 1; p <= PARITY_BUCKETS; p++) eligible += h.cows[cowIndex(slot, 0, p)];
  }
  for (let age = afs; age < MAX_HEIFER_AGE; age++) eligible += h.heifersOpen[age];

  const aiShare = Math.max(0, Math.min(1, a.repro.aiSharePct));
  const bullCapacity = h.bulls * a.repro.cowsPerBull;
  const naturalCoverage = eligible > 0 ? Math.min(1, bullCapacity / (eligible * (1 - aiShare) || 1)) : 1;
  const breedingCoverage = aiShare + (1 - aiShare) * naturalCoverage;
  const bullDeficit = Math.max(0, bullsNeeded - h.bulls);

  const conceptionRate = Math.max(
    0,
    Math.min(0.95, a.repro.monthlyConceptionRate * conceptionMult * breedingCoverage),
  );

  for (let slot = 0; slot < COW_SLOTS; slot++) {
    const servable = isDrySlot(slot) || slot >= vwp;
    if (!servable) continue;
    for (let p = 1; p <= PARITY_BUCKETS; p++) {
      const idx = cowIndex(slot, 0, p);
      const n = h.cows[idx];
      if (n <= 0) continue;
      const conceived = n * conceptionRate;
      h.cows[idx] = n - conceived;
      state.conceivedCows[idx] += conceived;
      flows.conceptions += conceived;
    }
  }
  for (let age = afs; age < MAX_HEIFER_AGE; age++) {
    const n = h.heifersOpen[age];
    if (n <= 0) continue;
    const conceived = n * conceptionRate;
    h.heifersOpen[age] = n - conceived;
    state.conceivedHeifers[age] += conceived;
    flows.conceptions += conceived;
  }
  vetUnits.services = eligible;

  // --- Envejecimiento ------------------------------------------------------
  const { nextCows, nextHeifersOpen, nextHeifersPregnant, nextMales } = state;
  nextCows.fill(0);
  nextHeifersOpen.fill(0);
  nextHeifersPregnant.fill(0);
  nextMales.fill(0);

  for (let slot = 0; slot < COW_SLOTS; slot++) {
    let newSlot: number;
    if (isDrySlot(slot)) {
      newSlot = Math.min(dryslot(MAX_DSM), slot + 1);
    } else {
      newSlot = slot + 1 > MAX_DIM ? dryslot(0) : slot + 1;
    }
    for (let g = 0; g < COW_GEST; g++) {
      const newGest = g >= 1 ? Math.min(GESTATION_MONTHS, g + 1) : 0;
      for (let p = 1; p <= PARITY_BUCKETS; p++) {
        const n = h.cows[cowIndex(slot, g, p)];
        if (n > 0) nextCows[cowIndex(newSlot, newGest, p)] += n;
      }
    }
    for (let p = 1; p <= PARITY_BUCKETS; p++) {
      const c = state.conceivedCows[cowIndex(slot, 0, p)];
      if (c > 0) nextCows[cowIndex(newSlot, 1, p)] += c;
    }
  }

  for (let age = 0; age < MAX_HEIFER_AGE; age++) {
    const newAge = Math.min(MAX_HEIFER_AGE - 1, age + 1);
    if (h.heifersOpen[age] > 0) nextHeifersOpen[newAge] += h.heifersOpen[age];
    if (state.conceivedHeifers[age] > 0) {
      nextHeifersPregnant[pregIndex(newAge, 1)] += state.conceivedHeifers[age];
    }
    for (let g = 1; g < GESTATION_MONTHS; g++) {
      const n = h.heifersPregnant[pregIndex(age, g)];
      if (n > 0) nextHeifersPregnant[pregIndex(newAge, g + 1)] += n;
    }
  }

  for (let age = 0; age < MAX_MALE_AGE; age++) {
    const newAge = Math.min(MAX_MALE_AGE - 1, age + 1);
    if (h.males[age] > 0) nextMales[newAge] += h.males[age];
  }

  h.cows.set(nextCows);
  h.heifersOpen.set(nextHeifersOpen);
  h.heifersPregnant.set(nextHeifersPregnant);
  h.males.set(nextMales);

  const bcsTarget = interpTable(a.feed.response.nbrToBcsTarget, nbr);
  h.bcs = Math.max(1, Math.min(5, h.bcs + BCS_ADJUST_RATE * (bcsTarget - h.bcs)));
  h.reserveStockKg = supply.reserveStockKg;
  h.underfedStreak = nbr < 0.85 ? h.underfedStreak + 1 : 0;

  // --- Cierre del estado financiero ----------------------------------------
  state.fin.cash = finance.cash.balance;
  state.fin.debtBalance = finance.cash.debtBalance;
  state.fin.fixedAssetsGross += capexThisMonth;
  state.fin.fixedAssetsAccumDep += finance.pnl.depreciation;
  state.fin.capitalCallCumulative += capitalCall;
  state.fin.cumulativeOperatingCash += finance.cash.operating;
  state.fin.cumulativeEbitda += finance.pnl.ebitda;
  state.fin.cumulativeNetIncome += finance.pnl.netIncome;
  state.fin.capexTotal += capexThisMonth;
  if (capexThisMonth > 0) {
    const added = a.capital.capex
      .filter((c) => c.month === month)
      .reduce((s, c) => s + c.amount / (Math.max(1, c.lifeYears) * 12), 0);
    state.fin.monthlyDepreciation += added;
  }

  const pregnantFemales =
    herdStart.heifersPregnant +
    (() => {
      let t = 0;
      for (let slot = 0; slot < COW_SLOTS; slot++)
        for (let g = 1; g <= GESTATION_MONTHS; g++)
          for (let p = 1; p <= PARITY_BUCKETS; p++) t += nextCows[cowIndex(slot, g, p)];
      return t;
    })();
  const breedableFemales = herdStart.cowsMilking + herdStart.cowsDry + herdStart.heifersRearing + herdStart.heifersPregnant;

  return {
    month,
    monthOfYear,
    herd: herdStart,
    flows,
    repro: {
      pregnancyRatePct: breedableFemales > 0 ? (pregnantFemales / breedableFemales) * 100 : 0,
      calvings,
      bullDeficit,
    },
    milk: {
      litersProduced,
      litersToCalves,
      litersDiscarded,
      litersSold,
      litersPerCowDay:
        herdStart.cowsMilking > 0 ? litersProduced / herdStart.cowsMilking / DAYS_PER_MONTH : 0,
      avgDim: potential.avgDim,
    },
    feed: {
      dmDemandKg: demand.totalKg,
      dmPastureKg: supply.pastureKg,
      dmReserveUsedKg: supply.reserveUsedKg,
      dmConcentrateKg: supply.concentrateDmKg,
      dmPurchasedKg: supply.purchasedKg,
      reserveStockKg: supply.reserveStockKg,
      nbr,
      bcs: h.bcs,
    },
    pnl: finance.pnl,
    cash: finance.cash,
    balance: finance.balance,
    flags: {
      cashBelowBuffer: finance.cash.balance < a.capital.minCashBuffer - 0.01,
      insolvent: finance.cash.balance < -0.01,
      forcedDestock,
      underfed: nbr < 0.85,
      bullShortage: bullDeficit > 0.05,
    },
  };
}

export function createSimState(herd: HerdState, fin: FinancialState): SimState {
  return {
    herd,
    fin,
    conceivedCows: new Float64Array(COW_STATES),
    conceivedHeifers: new Float64Array(MAX_HEIFER_AGE),
    nextCows: new Float64Array(COW_STATES),
    nextHeifersOpen: new Float64Array(MAX_HEIFER_AGE),
    nextHeifersPregnant: new Float64Array(HEIFER_PREG_STATES),
    nextMales: new Float64Array(MAX_MALE_AGE),
  };
}
