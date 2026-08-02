import { DEFAULT_ASSUMPTIONS } from '../src/engine/defaults';
import { simulate } from '../src/engine/simulate';

const t0 = performance.now();
const out = simulate(DEFAULT_ASSUMPTIONS);
const elapsed = performance.now() - t0;

const n = (v: number, d = 0) =>
  v.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });

console.log(`\nCorrida de ${out.months.length} meses en ${elapsed.toFixed(2)} ms\n`);
if (out.warnings.length) console.log('Avisos:', out.warnings, '\n');

console.log(
  ['mes', 'hato', 'ordeño', 'secas', 'novill', 'L/mes', 'NBR', 'BCS', 'EBITDA', 'caja', 'patrim']
    .map((s) => s.padStart(8))
    .join(''),
);
for (const m of out.months) {
  if (m.month % 6 !== 0) continue;
  console.log(
    [
      m.month,
      n(m.herd.total),
      n(m.herd.cowsMilking),
      n(m.herd.cowsDry),
      n(m.herd.heifersRearing + m.herd.heifersPregnant),
      n(m.milk.litersSold),
      m.feed.nbr.toFixed(2),
      m.feed.bcs.toFixed(2),
      n(m.pnl.ebitda),
      n(m.cash.balance),
      n(m.balance.bookEquity),
    ]
      .map((s) => String(s).padStart(8))
      .join(''),
  );
}

const s = out.summary;
console.log('\nResumen');
console.log('  Inversión inicial            ', n(s.initialInvestment));
console.log('  Costo de adquisición         ', n(s.acquisitionCost));
console.log('  Plusvalía de entrada         ', n(s.entryGain));
console.log('  Capital total requerido      ', n(s.totalCapitalRequired));
console.log('  Patrimonio contable final    ', n(s.finalBookEquity));
console.log('  Patrimonio de liquidación    ', n(s.finalLiquidationEquity));
console.log('  TIR anual                    ', s.irrAnnual === null ? 'n/d' : `${(s.irrAnnual * 100).toFixed(1)}%`);
console.log('  VAN                          ', n(s.npv));
console.log('  Mes de punto de equilibrio   ', s.breakevenMonth ?? 'nunca');
console.log('  Peor saldo de caja           ', `${n(s.worstCashBalance)} (mes ${s.worstCashMonth})`);
console.log('  Capital adicional requerido  ', n(s.maxCapitalRequired));
console.log('  Meses insolvente             ', s.monthsInsolvent);
console.log('  Litros vendidos totales      ', n(s.totalMilkLiters));
console.log('  Costo por litro              ', s.avgCostPerLiter.toFixed(3));
console.log('  Margen por litro             ', s.avgMarginPerLiter.toFixed(3));
console.log('  Hato final / pico            ', `${n(s.finalHerd)} / ${n(s.peakHerd)}`);
console.log('  Vacas en ordeño al final     ', n(s.finalCowsMilking));

const first = out.months[0];
console.log('\nPrimer mes');
console.log('  Litros producidos            ', n(first.milk.litersProduced));
console.log('  Litros a becerros            ', n(first.milk.litersToCalves));
console.log('  Litros vendidos              ', n(first.milk.litersSold));
console.log('  Demanda MS (kg)              ', n(first.feed.dmDemandKg));
console.log('  Pastura (kg)                 ', n(first.feed.dmPastureKg));
console.log('  Ingresos                     ', n(first.pnl.revenueTotal));
console.log('  Costos                       ', n(first.pnl.costTotal));
console.log('  Partos                       ', first.repro.calvings.toFixed(1));
