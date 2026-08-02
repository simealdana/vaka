import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from './defaults';
import { simulate } from './simulate';
import type { Assumptions, MonthlyResult, ScenarioOverride } from './types';

const run = (a: Assumptions = DEFAULT_ASSUMPTIONS, o: ScenarioOverride[] = []) => simulate(a, o);

const outflow = (f: MonthlyResult['flows']) =>
  f.deathsCalves + f.deathsHeifers + f.deathsCows + f.deathsBulls + f.culledCows + f.soldMales + f.soldHeifers;

describe('conservación del hato', () => {
  it('ningún animal aparece ni desaparece sin quedar registrado', () => {
    const months = run().months;
    for (let t = 0; t < months.length - 1; t++) {
      const cur = months[t];
      const next = months[t + 1];
      // El censo se toma después de los partos, así que los nacimientos del mes t+1 ya
      // están dentro de next.herd.total.
      const births = next.flows.birthsFemale + next.flows.birthsMale;
      const expected =
        cur.herd.total - outflow(cur.flows) + cur.flows.boughtBulls + cur.flows.boughtHeifers + births;
      expect(expected).toBeCloseTo(next.herd.total, 6);
    }
  });

  it('el censo inicial coincide con el hato declarado más los partos del primer mes', () => {
    const { herd } = DEFAULT_ASSUMPTIONS;
    const first = run().months[0];
    const declared = herd.cows + herd.heifers + herd.males + herd.bulls;
    const births = first.flows.birthsFemale + first.flows.birthsMale;
    expect(first.herd.total).toBeCloseTo(declared + births, 6);
  });

  it('ninguna categoría se vuelve negativa ni NaN', () => {
    for (const m of run().months) {
      for (const [key, value] of Object.entries(m.herd)) {
        expect(Number.isFinite(value), `herd.${key} en mes ${m.month}`).toBe(true);
        expect(value, `herd.${key} en mes ${m.month}`).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });
});

describe('cuadre financiero', () => {
  it('la caja de cada mes es la del anterior más el flujo neto', () => {
    const months = run().months;
    let previous = DEFAULT_ASSUMPTIONS.capital.initialCash;
    for (const m of months) {
      expect(m.cash.net).toBeCloseTo(m.cash.operating + m.cash.investing + m.cash.financing, 6);
      expect(m.cash.balance).toBeCloseTo(previous + m.cash.net, 6);
      previous = m.cash.balance;
    }
  });

  it('activos menos pasivos igual patrimonio contable, cada mes', () => {
    const land = DEFAULT_ASSUMPTIONS.capital.landHectares * DEFAULT_ASSUMPTIONS.capital.landPricePerHa;
    for (const m of run().months) {
      const assets = m.balance.cash + m.balance.herdValueBook + m.balance.fixedAssetsNet + m.balance.land;
      expect(m.balance.land).toBeCloseTo(land, 6);
      expect(assets - m.balance.debt).toBeCloseTo(m.balance.bookEquity, 6);
    }
  });

  it('el EBITDA es ingresos menos costos y la utilidad descuenta depreciación e intereses', () => {
    for (const m of run().months) {
      expect(m.pnl.ebitda).toBeCloseTo(m.pnl.revenueTotal - m.pnl.costTotal, 6);
      expect(m.pnl.netIncome).toBeCloseTo(
        m.pnl.ebitda - m.pnl.depreciation - m.pnl.interest - m.pnl.taxes,
        6,
      );
    }
  });

  it('un haircut mayor siempre reduce el patrimonio de liquidación', () => {
    const equity = (haircut: number) =>
      run({ ...DEFAULT_ASSUMPTIONS, prices: { ...DEFAULT_ASSUMPTIONS.prices, liquidationHaircutPct: haircut } })
        .summary.finalLiquidationEquity;
    const values = [0, 0.1, 0.25, 0.5].map(equity);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThan(values[i - 1]);
  });

  it('sin haircut el patrimonio de liquidación supera al contable, porque el hato vale más que su costo', () => {
    const s = run({
      ...DEFAULT_ASSUMPTIONS,
      prices: { ...DEFAULT_ASSUMPTIONS.prices, liquidationHaircutPct: 0 },
    }).summary;
    expect(s.finalLiquidationEquity).toBeGreaterThan(s.finalBookEquity);
  });
});

describe('determinismo', () => {
  it('los mismos supuestos producen exactamente el mismo resultado', () => {
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it('simular no muta los supuestos recibidos', () => {
    const before = JSON.stringify(DEFAULT_ASSUMPTIONS);
    run(DEFAULT_ASSUMPTIONS, [
      {
        id: 'p', label: 'precio', target: 'channels.industryPricePerLiter',
        op: 'multiply', value: 0.7, startMonth: 3, durationMonths: 12,
      },
    ]);
    expect(JSON.stringify(DEFAULT_ASSUMPTIONS)).toBe(before);
  });

  it('summaryOnly devuelve el mismo resumen sin el detalle mensual', () => {
    const full = simulate(DEFAULT_ASSUMPTIONS);
    const light = simulate(DEFAULT_ASSUMPTIONS, [], { summaryOnly: true });
    expect(light.months).toHaveLength(0);
    expect(light.summary).toEqual(full.summary);
  });
});

describe('estabilidad de la finca base', () => {
  const months = run().months;

  it('no produce ningún valor no finito en 120 meses', () => {
    for (const m of months) {
      for (const section of [m.herd, m.milk, m.feed, m.pnl, m.cash, m.balance, m.repro, m.flows]) {
        for (const [key, value] of Object.entries(section)) {
          expect(Number.isFinite(value), `${key} en mes ${m.month}`).toBe(true);
        }
      }
    }
  });

  it('no oscila: el hato en ordeño se mueve poco de un mes al siguiente', () => {
    for (let t = 25; t < months.length; t++) {
      const change = Math.abs(months[t].herd.cowsMilking / months[t - 1].herd.cowsMilking - 1);
      expect(change, `salto en el mes ${t}`).toBeLessThan(0.08);
    }
  });

  it('converge al tamaño objetivo sin explotar ni extinguirse', () => {
    const target = DEFAULT_ASSUMPTIONS.policy.targetHerdSize;
    const last = months[months.length - 1];
    expect(last.herd.total).toBeGreaterThan(target * 0.8);
    expect(last.herd.total).toBeLessThan(target * 1.2);
    expect(last.herd.cowsMilking).toBeGreaterThan(0);
  });

  it('la condición corporal se mantiene en un rango fisiológico', () => {
    for (const m of months) {
      expect(m.feed.bcs).toBeGreaterThan(2);
      expect(m.feed.bcs).toBeLessThanOrEqual(5);
    }
  });
});

describe('validación de supuestos', () => {
  it('avisa cuando los canales de leche no suman 100%', () => {
    const a = {
      ...DEFAULT_ASSUMPTIONS,
      channels: { ...DEFAULT_ASSUMPTIONS.channels, industryShare: 0.9, directShare: 0.3, cheeseShare: 0.2 },
    };
    expect(run(a).warnings.map((w) => w.code)).toContain('channel-shares');
  });

  it('avisa cuando el hato inicial no tiene vacas', () => {
    const a = { ...DEFAULT_ASSUMPTIONS, herd: { ...DEFAULT_ASSUMPTIONS.herd, cows: 0 } };
    expect(run(a).warnings.map((w) => w.code)).toContain('no-cows');
  });

  it('la finca base no dispara ningún aviso', () => {
    expect(run().warnings).toEqual([]);
  });
});
