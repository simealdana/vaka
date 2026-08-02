import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from './defaults';
import { NBR_MIN } from './nutrition/balance';
import { simulate } from './simulate';
import type { Assumptions, ScenarioOverride } from './types';

/** Finca sin tope de hato ni venta forzada: aísla el canal demográfico del financiero. */
const ISOLATED: Assumptions = {
  ...DEFAULT_ASSUMPTIONS,
  policy: { ...DEFAULT_ASSUMPTIONS.policy, targetHerdSize: 0, destockOnCashTrigger: false },
};

const shock = (o: Partial<ScenarioOverride>): ScenarioOverride => ({
  id: 'x',
  label: 'x',
  target: 'feed.dmPerHaMonth',
  op: 'multiply',
  value: 1,
  startMonth: 12,
  durationMonths: 18,
  ...o,
});

describe('efectos diferidos', () => {
  // Es la prueba de que el modelo por cohortes hace su trabajo: una becerra que muere hoy
  // no es una vaca que falta hoy, sino dentro de casi tres años.
  const base = simulate(ISOLATED).months;
  const sick = simulate({
    ...ISOLATED,
    health: { ...ISOLATED.health, calfMortalityToWeaning: 0.3 },
  }).months;

  it('quintuplicar la mortalidad de becerras no toca las vacas en ordeño durante los primeros 28 meses', () => {
    for (let m = 0; m <= 28; m++) {
      const delta = sick[m].herd.cowsMilking / base[m].herd.cowsMilking - 1;
      expect(Math.abs(delta), `mes ${m}`).toBeLessThan(0.005);
    }
  });

  it('sí las reduce a partir del mes 36, cuando esa cohorte debía estar pariendo', () => {
    const at = (m: number) => sick[m].herd.cowsMilking / base[m].herd.cowsMilking - 1;
    expect(at(36)).toBeLessThan(-0.01);
    expect(at(60)).toBeLessThan(-0.05);
    // El daño se profundiza: cada cohorte siguiente llega igual de mermada.
    expect(at(60)).toBeLessThan(at(36));
  });

  it('el hueco aparece antes en las novillas que en las vacas', () => {
    const heifers = (ms: typeof base, m: number) => ms[m].herd.heifersRearing;
    const heiferGap = heifers(sick, 18) / heifers(base, 18) - 1;
    const cowGap = sick[18].herd.cowsMilking / base[18].herd.cowsMilking - 1;
    expect(heiferGap).toBeLessThan(-0.05);
    expect(Math.abs(cowGap)).toBeLessThan(0.005);
  });
});

describe('superaditividad', () => {
  const equity = (o: ScenarioOverride[]) => simulate(DEFAULT_ASSUMPTIONS, o).summary.finalBookEquity;
  const baseline = equity([]);
  const impact = (o: ScenarioOverride[]) => equity(o) - baseline;

  const sequia = shock({ id: 'sequia', target: 'feed.dmPerHaMonth', op: 'multiply', value: 0.45 });
  const forraje = shock({
    id: 'forraje',
    target: 'feed.purchasedForageCostPerKgDm',
    op: 'multiply',
    value: 2.2,
    durationMonths: Number.POSITIVE_INFINITY,
  });

  it('sequía más forraje caro es estrictamente peor que la suma de ambos por separado', () => {
    const a = impact([sequia]);
    const b = impact([forraje]);
    const both = impact([sequia, forraje]);
    expect(a).toBeLessThan(0);
    expect(b).toBeLessThan(0);
    // La sequía es justamente lo que obliga a comprar el forraje que el otro shock encarece.
    expect(both).toBeLessThan(a + b);
    expect(both - (a + b)).toBeLessThan(-1000);
  });

  it('sequía más concentrado caro NO es superaditivo, porque la sequía reduce la leche que consume concentrado', () => {
    const concentrado = shock({
      id: 'concentrado',
      target: 'feed.concentrateCostPerKg',
      op: 'multiply',
      value: 1.4,
      durationMonths: Number.POSITIVE_INFINITY,
    });
    const interaction = impact([sequia, concentrado]) - impact([sequia]) - impact([concentrado]);
    expect(interaction).toBeGreaterThanOrEqual(0);
  });

  // La crisis compuesta del documento (líneas 205-211): leche −20%, alimento +30%,
  // mortalidad de becerros al 12% y siete meses de sequía. Es el caso que justifica que el
  // simulador exista: cuatro golpes moderados que juntos hacen más daño que sumados.
  it('la crisis compuesta del documento es estrictamente peor que la suma de sus cuatro golpes', () => {
    const window = { startMonth: 12, durationMonths: 12 };
    const leche = shock({ ...window, id: 'leche', target: 'milk.priceIndex', op: 'pctDelta', value: -0.2 });
    const concentrado = shock({ ...window, id: 'conc', target: 'feed.concentrateCostPerKg', op: 'pctDelta', value: 0.3 });
    const forraje = shock({ ...window, id: 'forr', target: 'feed.purchasedForageCostPerKgDm', op: 'pctDelta', value: 0.3 });
    const mortalidad = shock({ ...window, id: 'mort', target: 'health.calfMortalityToWeaning', op: 'set', value: 0.12 });
    const sequia7 = shock({ id: 'seq7', target: 'feed.dmPerHaMonth', op: 'multiply', value: 0.5, startMonth: 12, durationMonths: 7 });

    const parts = [leche, [concentrado, forraje], mortalidad, sequia7];
    const sum = parts.reduce((a, p) => a + impact(Array.isArray(p) ? p : [p]), 0);
    const together = impact([leche, concentrado, forraje, mortalidad, sequia7]);

    expect(sum).toBeLessThan(0);
    expect(together).toBeLessThan(sum);
    // Y no por decimales: la interacción vale miles de dólares.
    expect(together - sum).toBeLessThan(-1000);
  });
});

describe('cadena nutrición → condición corporal → fertilidad', () => {
  it('el NBR toca fondo en dos meses y la condición corporal sigue cayendo después', () => {
    // Sin la válvula de escape del forraje comprado, el déficit llega al animal.
    const m = simulate({ ...ISOLATED, feed: { ...ISOLATED.feed, buyForageOnDeficit: false } }, [
      shock({ id: 'sequia', target: 'feed.dmPerHaMonth', op: 'multiply', value: 0.35, startMonth: 24 }),
    ]).months;

    const nbr = (t: number) => m[t].feed.nbr;
    const bcs = (t: number) => m[t].feed.bcs;

    // El balance del mes es instantáneo: se desploma y se pega al piso.
    expect(nbr(25)).toBeLessThan(nbr(24) - 0.4);
    expect(nbr(26)).toBeCloseTo(NBR_MIN, 10);
    expect(nbr(27)).toBeCloseTo(nbr(26), 10);

    // La condición corporal es un integrador: sigue bajando cuando el NBR ya está plano.
    // Esa diferencia de escalas temporales es lo que da el rezago reproductivo.
    expect(bcs(27)).toBeLessThan(bcs(26));
    expect(bcs(28)).toBeLessThan(bcs(27));
    expect(bcs(25)).toBeGreaterThan(bcs(28));
  });

  it('la condición corporal baja arrastra la tasa de preñez con rezago', () => {
    const stressed = simulate(
      { ...ISOLATED, feed: { ...ISOLATED.feed, buyForageOnDeficit: false } },
      [shock({ id: 'sequia', target: 'feed.dmPerHaMonth', op: 'multiply', value: 0.3, startMonth: 24, durationMonths: 24 })],
    ).months;
    const calm = simulate({ ...ISOLATED, feed: { ...ISOLATED.feed, buyForageOnDeficit: false } }).months;

    expect(stressed[30].feed.bcs).toBeLessThan(calm[30].feed.bcs);
    expect(stressed[44].repro.pregnancyRatePct).toBeLessThan(calm[44].repro.pregnancyRatePct);
  });
});
