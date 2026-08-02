import type { ScenarioOverride, SimulationOutput, SimulationSummary } from '@/engine/types';
import { MC_VARIABLES } from '@/lib/assumptions/schema';
import { STRESS_PRESETS, instantiate } from '@/lib/assumptions/presets/stress';
import { decimals, money, pct, signedPct } from '@/lib/format';
import { baselineOutput, runScenario } from '@/lib/sim/useSimulation';
import { type EditMap, baseFor } from '@/lib/state/useAssumptionsStore';

/** Una fila de la respuesta: el número gordo va aparte del detalle. */
export interface AnswerRow {
  label: string;
  value: string;
  /** `true` marca la fila que resume la respuesta. */
  key?: boolean;
}

export interface Answer {
  id: string;
  question: string;
  /** La respuesta en una frase, ya redactada con las cifras dentro. */
  headline: string;
  rows: AnswerRow[];
  /** Cómo se calculó: sin esto el número no se puede discutir. */
  method: string;
  /** Advertencia cuando la búsqueda no encontró un límite dentro del rango probado. */
  caveat?: string;
}

type Run = (edits: Record<string, number>, overrides?: ScenarioOverride[]) => SimulationOutput;

/**
 * Bisección sobre una variable monótona. `ok(summary)` dice si el valor `x` todavía aguanta;
 * devuelve la frontera con la precisión pedida, o `null` si ni el extremo bueno aguanta.
 */
function bisect(
  run: Run,
  path: string,
  goodValue: number,
  badValue: number,
  ok: (s: SimulationSummary) => boolean,
  tolerance: number,
  overrides?: ScenarioOverride[],
  extra: Record<string, number> = {},
): number | null | 'sin-limite' {
  const at = (x: number) => run({ ...extra, [path]: x }, overrides).summary;
  if (!ok(at(goodValue))) return null;
  // El extremo malo también aguanta: la variable no tiene punto de quiebre en el rango probado.
  if (ok(at(badValue))) return 'sin-limite';
  let good = goodValue;
  let bad = badValue;
  // 40 pasos bastan para cualquier rango de estas variables; el corte real es la tolerancia.
  for (let i = 0; i < 40 && Math.abs(bad - good) > tolerance; i++) {
    const mid = (good + bad) / 2;
    if (ok(at(mid))) good = mid;
    else bad = mid;
  }
  return good;
}

const num = (x: number | null | 'sin-limite'): number | null =>
  typeof x === 'number' ? x : null;

const monthsOfCash = (base: EditMap): number => {
  const out = baselineOutput(base);
  const spend = out.months.slice(0, 12).reduce((a, m) => a + m.pnl.costTotal, 0) / 12;
  return spend > 0 ? out.months[0].cash.balance / spend : 0;
};

export function solveQuestions(base: EditMap): Answer[] {
  const b = baselineOutput(base);
  const s0 = b.summary;
  const run: Run = (edits, overrides) => runScenario({ edits, overrides: overrides ?? [] }, base);
  const val = (path: string) => baseFor(path, base);
  const answers: Answer[] = [];

  /**
   * La pila de crisis que sí tumba la finca: se ordenan las ocho pruebas por daño y se apilan,
   * con el aporte de capital apagado, hasta que aparece el primer mes insolvente. Sirve de
   * escenario de referencia para las preguntas de liquidez y de inversión defensiva.
   */
  const stack = (() => {
    const ranked = STRESS_PRESETS.map((p) => ({
      preset: p,
      equity: run({ 'policy.capitalCallEnabled': 0 }, p.overrides.map(instantiate)).summary
        .finalBookEquity,
    })).sort((a, b) => a.equity - b.equity);

    const labels: string[] = [];
    const overrides: ScenarioOverride[] = [];
    for (const item of ranked) {
      labels.push(item.preset.label);
      overrides.push(...item.preset.overrides.map(instantiate));
      const s = run({ 'policy.capitalCallEnabled': 0 }, overrides).summary;
      if (s.monthsInsolvent > 0) return { labels, overrides, summary: s, broke: true };
    }
    return {
      labels,
      overrides,
      summary: run({ 'policy.capitalCallEnabled': 0 }, overrides).summary,
      broke: false,
    };
  })();

  // 1 — hasta cuánto puede bajar la leche -------------------------------------------------
  {
    const price = val('milk.priceIndex');
    const limit = num(
      bisect(run, 'milk.priceIndex', price, price * 0.2, (s) => s.cumulativeNetIncome > 0, 0.002),
    );
    answers.push({
      id: 'precio-leche',
      question: '¿Hasta cuánto puede bajar la leche antes de que pierda dinero?',
      headline:
        limit === null
          ? 'La finca ya pierde plata al precio actual: no hay margen que perder.'
          : `El precio puede caer ${signedPct(limit / price - 1, 1)} y la finca todavía cierra los diez años con utilidad acumulada positiva.`,
      rows: [
        { label: 'Precio de hoy (índice)', value: decimals(price, 3) },
        { label: 'Índice de equilibrio', value: limit === null ? '—' : decimals(limit, 3), key: true },
        {
          label: 'Precio al industrial en el límite',
          value:
            limit === null
              ? '—'
              : `$${(val('channels.industryPricePerLiter') * limit).toFixed(3)} / L`,
          key: true,
        },
        {
          label: 'Utilidad acumulada hoy',
          value: money(s0.cumulativeNetIncome),
        },
      ],
      method:
        'Bisección sobre `milk.priceIndex` buscando dónde la utilidad neta acumulada a 10 años cruza cero.',
    });
  }

  // 2 — capital si la leche baja 30% un año -----------------------------------------------
  {
    const shock: ScenarioOverride[] = [
      {
        id: 'q2',
        label: 'Leche −30% durante un año',
        target: 'milk.priceIndex',
        op: 'pctDelta',
        value: -0.3,
        startMonth: 12,
        durationMonths: 12,
        recovery: { type: 'linear', months: 6 },
      },
    ];
    const out = run({}, shock);
    // Sin desmontar hato ni pedir capital: así se ve el hueco de caja de verdad, no el
    // que el motor ya tapó vendiendo animales.
    const bare = run({ 'policy.capitalCallEnabled': 0, 'policy.destockOnCashTrigger': 0 }, shock);
    const window = bare.months.slice(12, 36);
    const trough = window.reduce((a, m) => Math.min(a, m.cash.balance), Infinity);
    const gap = Math.max(0, val('capital.minCashBuffer') - trough);
    answers.push({
      id: 'capital-caida-leche',
      question: '¿Cuánto capital necesito si la leche baja 30% durante un año?',
      headline:
        gap > 0
          ? `Hacen falta ${money(gap)} para no bajar del colchón durante el año malo.`
          : `Ni un dólar: aun sin vender animales la caja toca fondo en ${money(trough)} y no rompe el colchón de ${money(val('capital.minCashBuffer'))}.`,
      rows: [
        { label: 'Capital que el motor tuvo que inyectar', value: money(out.summary.maxCapitalRequired), key: true },
        {
          label: 'Sin vender animales, caja mínima del golpe',
          value: money(trough),
          key: true,
        },
        { label: 'Faltante contra el colchón', value: money(gap) },
        {
          label: 'Sin vender animales, meses insolventes',
          value: decimals(bare.summary.monthsInsolvent, 0),
        },
        {
          label: 'Δ patrimonio a 10 años',
          value: money(out.summary.finalBookEquity - s0.finalBookEquity),
        },
        {
          label: 'Δ litros en 10 años',
          value: signedPct(out.summary.totalMilkLiters / s0.totalMilkLiters - 1, 1),
        },
      ],
      method:
        'Evento de −30% en `milk.priceIndex` del mes 13 al 24 con recuperación lineal de 6 meses. El faltante se mide sobre la caja mínima entre los meses 13 y 36 con `capitalCallEnabled` y `destockOnCashTrigger` apagados, que es el hueco antes de tapar nada.',
    });
  }

  // 3 — mortalidad máxima ------------------------------------------------------------------
  {
    const calf = val('health.calfMortalityToWeaning');
    const cow = val('health.cowMortalityAnnual');
    const start = b.months[0].herd.total;
    // «Soporta» = el hato se repone solo y el negocio deja plata. Medirlo contra el
    // patrimonio no sirve: la tierra pesa tanto que tapa la muerte del hato entero.
    const holds = (s: SimulationSummary) => s.finalHerd >= start && s.cumulativeNetIncome > 0;
    const limitCalf = bisect(run, 'health.calfMortalityToWeaning', calf, 0.95, holds, 0.002);
    const limitCow = bisect(run, 'health.cowMortalityAnnual', cow, 0.6, holds, 0.002);
    const fmt = (x: number | null | 'sin-limite') =>
      x === null ? '—' : x === 'sin-limite' ? 'no es lo que quiebra la finca' : pct(x, 1);
    const calfCurve = [0.2, 0.4, 0.6, 0.8].map((v) => ({
      v,
      s: run({ 'health.calfMortalityToWeaning': v }).summary,
    }));
    answers.push({
      id: 'mortalidad-maxima',
      question: '¿Qué mortalidad máxima soporta el proyecto?',
      headline: `La que manda es la de vacas: hasta ${fmt(limitCow)} anual el hato todavía se repone solo. La de becerros ${limitCalf === 'sin-limite' ? 'no tiene tope en el rango probado, porque con el potrero al límite cada becerro que no nace le deja pasto a una vaca en ordeño' : `topa en ${fmt(limitCalf)}`}.`,
      rows: [
        { label: 'Hato de partida', value: `${decimals(start, 0)} cabezas` },
        { label: 'Mortalidad anual de vacas hoy', value: pct(cow, 1) },
        { label: 'Tope de vacas', value: fmt(limitCow), key: true },
        {
          label: 'Patrimonio en el tope de vacas',
          value:
            typeof limitCow === 'number'
              ? money(run({ 'health.cowMortalityAnnual': limitCow }).summary.finalBookEquity)
              : '—',
        },
        { label: 'Mortalidad de becerros hoy', value: pct(calf, 1) },
        { label: 'Tope de becerros', value: fmt(limitCalf), key: true },
        ...calfCurve.map((c) => ({
          label: `Becerros al ${pct(c.v, 0)}`,
          value: `hato ${decimals(c.s.finalHerd, 0)} · patrimonio ${money(c.s.finalBookEquity)}`,
        })),
      ],
      method:
        'Dos bisecciones independientes. El criterio de «soporta» es cerrar los diez años con utilidad acumulada positiva y con un hato no menor al de partida.',
      caveat:
        'Las dos mortalidades se prueban por separado: juntas el daño es peor que la suma. Y la de becerros sale casi inocua porque esta finca está limitada por pasto, no por nacimientos: en una finca con forraje de sobra el resultado sería otro.',
    });
  }

  // 4 — sin hembras seis meses -------------------------------------------------------------
  {
    const out = run({}, [
      {
        id: 'q4',
        label: 'Ninguna hembra nace durante seis meses',
        target: 'repro.femaleBirthRatio',
        op: 'set',
        value: 0,
        startMonth: 12,
        durationMonths: 6,
        recovery: { type: 'immediate', months: 0 },
      },
    ]);
    const heifers = (o: SimulationOutput, m: number) =>
      o.months[m].herd.heifersRearing + o.months[m].herd.heifersPregnant;
    let worstMonth = 0;
    let worstGap = 0;
    for (let m = 12; m < b.months.length; m++) {
      const gap = heifers(out, m) - heifers(b, m);
      if (gap < worstGap) {
        worstGap = gap;
        worstMonth = m;
      }
    }
    const dEquity = out.summary.finalBookEquity - s0.finalBookEquity;
    const dLiters = out.summary.totalMilkLiters / s0.totalMilkLiters - 1;
    answers.push({
      id: 'sin-hembras',
      question: '¿Qué pasa si no nace ninguna hembra durante seis meses?',
      headline: `Falta un lote de reemplazos: hasta ${decimals(Math.abs(worstGap), 0)} novillas menos en el mes ${worstMonth + 1}. ${
        dEquity < 0
          ? `El patrimonio termina ${money(dEquity)} por debajo.`
          : `Aun así el patrimonio sube ${money(dEquity)} y la leche ${signedPct(dLiters, 1)}: con menos bocas el pasto alcanza mejor y las vacas que quedan producen más. El golpe es al crecimiento del hato, no al bolsillo.`
      }`,
      rows: [
        { label: 'Novillas de menos, máximo', value: decimals(Math.abs(worstGap), 0), key: true },
        { label: 'Mes del hueco máximo', value: `mes ${worstMonth + 1}` },
        {
          label: 'Vacas en ordeño al final',
          value: `${decimals(out.summary.finalCowsMilking, 0)} (base ${decimals(s0.finalCowsMilking, 0)})`,
        },
        { label: 'Δ litros en 10 años', value: signedPct(dLiters, 1) },
        { label: 'Δ patrimonio', value: money(dEquity), key: true },
        {
          label: 'Hato final',
          value: `${decimals(out.summary.finalHerd, 0)} (base ${decimals(s0.finalHerd, 0)})`,
        },
      ],
      method:
        'Evento `repro.femaleBirthRatio = 0` del mes 13 al 18. El hueco se mide comparando el inventario de novillas mes a mes contra la finca base.',
    });
  }

  // 5 — novillas que paren a los 42 meses --------------------------------------------------
  {
    const current = val('repro.ageFirstServiceMonths');
    // Parir a los 42 = servirlas a los 33, porque la gestación son nueve meses.
    const out = run({ 'repro.ageFirstServiceMonths': 33 });
    answers.push({
      id: 'edad-primer-parto',
      question: '¿Qué sucede si las novillas tardan 42 meses en parir?',
      headline: `Servirlas a los 33 meses en vez de a los ${decimals(current, 0)} cuesta ${money(Math.abs(out.summary.finalBookEquity - s0.finalBookEquity))} de patrimonio y ${signedPct(out.summary.totalMilkLiters / s0.totalMilkLiters - 1, 1)} de leche.`,
      rows: [
        { label: 'Edad al primer servicio hoy', value: `${decimals(current, 0)} meses` },
        { label: 'Edad probada', value: '33 meses (parto a los 42)', key: true },
        { label: 'Δ patrimonio', value: money(out.summary.finalBookEquity - s0.finalBookEquity), key: true },
        { label: 'Δ litros en 10 años', value: signedPct(out.summary.totalMilkLiters / s0.totalMilkLiters - 1, 1) },
        {
          label: 'Hato final',
          value: `${decimals(out.summary.finalHerd, 0)} (base ${decimals(s0.finalHerd, 0)})`,
        },
        { label: 'TIR anual', value: out.summary.irrAnnual === null ? '—' : pct(out.summary.irrAnnual, 2) },
      ],
      method:
        'La pregunta habla del parto; el motor pide la edad al primer servicio, así que se restan los nueve meses de gestación: 42 − 9 = 33.',
    });
  }

  // 6 — venta de emergencia de 30 animales -------------------------------------------------
  {
    const heifers = val('herd.heifers');
    const priceHeifer = val('prices.heiferPricePerHead');
    const cash = val('capital.initialCash');
    const proceeds = 30 * priceHeifer;
    const out = run({
      'herd.heifers': Math.max(0, heifers - 30),
      'capital.initialCash': cash + proceeds,
    });
    answers.push({
      id: 'venta-emergencia',
      question: '¿Qué pasa si debo vender 30 animales de emergencia?',
      headline: `Entran ${money(proceeds)} hoy y a diez años el patrimonio queda ${money(out.summary.finalBookEquity - s0.finalBookEquity)}: la caja de hoy se paga con leche que nunca se ordeñó.`,
      rows: [
        { label: 'Novillas vendidas', value: '30' },
        { label: 'Caja que entra', value: money(proceeds), key: true },
        { label: 'Δ patrimonio a 10 años', value: money(out.summary.finalBookEquity - s0.finalBookEquity), key: true },
        { label: 'Δ litros en 10 años', value: signedPct(out.summary.totalMilkLiters / s0.totalMilkLiters - 1, 1) },
        {
          label: 'Hato final',
          value: `${decimals(out.summary.finalHerd, 0)} (base ${decimals(s0.finalHerd, 0)})`,
        },
        { label: 'Costo por animal vendido', value: money((out.summary.finalBookEquity - s0.finalBookEquity) / 30) },
      ],
      method:
        'Se quitan 30 novillas del hato inicial y su precio de venta entra a la caja inicial. La diferencia contra la finca base es el costo real de la venta de emergencia.',
    });
  }

  // 7 — meses de caja ----------------------------------------------------------------------
  {
    const cash = val('capital.initialCash');
    const buffer = val('capital.minCashBuffer');
    const spend = b.months.slice(0, 12).reduce((a, m) => a + m.pnl.costTotal, 0) / 12;
    // Sin vender animales ni pedir plata: la caja tiene que aguantar sola. Lo que importa no
    // es el saldo mínimo sino cuánto llega a caer desde su máximo, que es el hueco a tapar.
    const bare = { 'policy.capitalCallEnabled': 0, 'policy.destockOnCashTrigger': 0 };
    // Solo las crisis que se acaban: un colchón cubre un bache, no una inflación permanente.
    const temporary = STRESS_PRESETS.filter((p) =>
      p.overrides.every((o) => Number.isFinite(o.durationMonths)),
    );
    const drawdowns = temporary.map((p) => {
      const out = run(bare, p.overrides.map(instantiate));
      let peak = -Infinity;
      let worst = 0;
      for (const m of out.months) {
        peak = Math.max(peak, m.cash.balance);
        worst = Math.max(worst, peak - m.cash.balance);
      }
      return { label: p.label, drawdown: worst };
    }).sort((a, b) => b.drawdown - a.drawdown);

    const need = drawdowns[0].drawdown + buffer;
    answers.push({
      id: 'meses-de-caja',
      question: '¿Cuántos meses de caja debo mantener?',
      headline: `La crisis que más caja se come es «${drawdowns[0].label}»: hunde el saldo ${money(drawdowns[0].drawdown)} desde su punto más alto. Con el colchón encima, hay que mantener ${money(need)}, unos ${decimals(need / spend, 1)} meses de gasto.`,
      rows: [
        { label: 'Gasto mensual promedio del primer año', value: money(spend) },
        { label: 'Caja de hoy', value: `${money(cash)} (${decimals(monthsOfCash(base), 1)} meses)` },
        { label: 'Colchón configurado', value: money(buffer) },
        { label: 'Caja recomendada', value: money(need), key: true },
        { label: 'En meses de gasto', value: `${decimals(need / spend, 1)} meses`, key: true },
        ...drawdowns.slice(0, 4).map((d) => ({
          label: `Bache de «${d.label}»`,
          value: `${money(d.drawdown)} · ${decimals(d.drawdown / spend, 1)} meses`,
        })),
      ],
      method: `Las ${temporary.length} pruebas de estrés que tienen fecha de vencimiento se corren con \`capitalCallEnabled\` y \`destockOnCashTrigger\` apagados. El bache es la caída máxima del saldo de caja desde su punto más alto; la recomendación es ese bache más el colchón configurado.`,
      caveat:
        'Cubre una crisis temporal a la vez. Las crisis permanentes —inflación de costos sostenida— quedan fuera a propósito: no hay colchón que las tape, se arreglan cambiando la estructura de costos.',
    });
  }

  // 8 — variable que más amenaza el patrimonio ---------------------------------------------
  const sensitivity = MC_VARIABLES.map((spec) => {
    const v = val(spec.path);
    const lo = spec.mc ? spec.mc.min : v * 0.8;
    const hi = spec.mc ? spec.mc.max : v * 1.2;
    const low = run({ [spec.path]: lo }).summary.finalBookEquity;
    const high = run({ [spec.path]: hi }).summary.finalBookEquity;
    return {
      path: spec.path,
      label: spec.label,
      /** El extremo del rango que más daña el patrimonio: lo reutiliza la pregunta 9. */
      adverse: low < high ? lo : hi,
      current: v,
      down: Math.min(low, high) - s0.finalBookEquity,
      up: Math.max(low, high) - s0.finalBookEquity,
      span: Math.abs(high - low),
    };
  });

  {
    const worst = [...sensitivity].sort((a, b) => a.down - b.down).slice(0, 6);
    answers.push({
      id: 'variable-peligrosa',
      question: '¿Qué variable amenaza más mi patrimonio?',
      headline: `${worst[0].label}: en su peor valor razonable se lleva ${money(Math.abs(worst[0].down))} del patrimonio.`,
      rows: worst.map((r, i) => ({
        label: `${i + 1}. ${r.label}`,
        value: `${money(r.down)} en el peor caso`,
        key: i === 0,
      })),
      method:
        'Cada variable con rango declarado en el esquema se corre sola en sus extremos min y max. Se ordenan por la caída de patrimonio en el extremo adverso.',
      caveat: 'Es sensibilidad de una variable a la vez: no captura las interacciones entre ellas.',
    });
  }

  // 9 — peor escenario razonable -----------------------------------------------------------
  {
    const edits: Record<string, number> = {};
    for (const r of sensitivity) if (r.adverse !== r.current) edits[r.path] = r.adverse;
    const out = run(edits);
    answers.push({
      id: 'peor-escenario',
      question: '¿Cuál es el peor escenario razonablemente posible?',
      headline: `Con las ${Object.keys(edits).length} variables inciertas en su extremo malo a la vez, el patrimonio termina en ${money(out.summary.finalBookEquity)} (${signedPct(out.summary.finalBookEquity / s0.finalBookEquity - 1, 1)}).`,
      rows: [
        { label: 'Patrimonio final', value: money(out.summary.finalBookEquity), key: true },
        { label: 'Δ contra la finca base', value: money(out.summary.finalBookEquity - s0.finalBookEquity), key: true },
        { label: 'TIR anual', value: out.summary.irrAnnual === null ? '—' : pct(out.summary.irrAnnual, 2) },
        { label: 'Capital requerido', value: money(out.summary.maxCapitalRequired) },
        { label: 'Meses insolventes', value: decimals(out.summary.monthsInsolvent, 0) },
        { label: 'Litros en 10 años', value: signedPct(out.summary.totalMilkLiters / s0.totalMilkLiters - 1, 1) },
      ],
      method:
        'Todas las variables con rango declarado puestas simultáneamente en el extremo que más daña el patrimonio. Es el peor caso del rango, no el peor caso imaginable.',
      caveat:
        'Que todas las variables lleguen a la vez a su extremo es improbabilísimo: la pantalla de Riesgo da la distribución real.',
    });
  }

  // 10 — combinación que lleva a la quiebra ------------------------------------------------
  {
    const s = stack.summary;
    answers.push({
      id: 'quiebra',
      question: '¿Qué combinación de eventos podría llevarme a la quiebra?',
      headline: stack.broke
        ? `Con ${stack.labels.length} de las ocho crisis encima —${stack.labels.join(' + ')}— y sin aporte de capital, la finca se queda sin liquidez en el mes ${(s.firstInsolventMonth ?? 0) + 1}.`
        : 'Ni las ocho crisis juntas dejan la finca insolvente sin aporte de capital: vender ganado la salva, pero se come el hato.',
      rows: [
        { label: 'Crisis apiladas', value: `${stack.labels.length} de 8`, key: true },
        { label: 'Cuáles', value: stack.labels.join(' + ') },
        {
          label: 'Primer mes sin liquidez',
          value: s.firstInsolventMonth === null ? 'ninguno' : `mes ${s.firstInsolventMonth + 1}`,
          key: true,
        },
        { label: 'Meses insolventes', value: decimals(s.monthsInsolvent, 0) },
        { label: 'Patrimonio final', value: money(s.finalBookEquity) },
        { label: 'Δ contra la finca base', value: money(s.finalBookEquity - s0.finalBookEquity) },
        { label: 'Hato final', value: `${decimals(s.finalHerd, 0)} (base ${decimals(s0.finalHerd, 0)})` },
        { label: 'TIR anual', value: s.irrAnnual === null ? '—' : pct(s.irrAnnual, 2) },
      ],
      method:
        'Las ocho pruebas de estrés se ordenan por daño y se van apilando con `capitalCallEnabled` apagado hasta que aparece el primer mes insolvente. Esa pila es también el escenario de referencia de las preguntas 7, 12 y 13.',
    });
  }

  // 11 — cuándo frenar el crecimiento ------------------------------------------------------
  {
    const current = val('policy.targetHerdSize');
    const sizes = [80, 100, 120, 140, 160, 180, 200, 220, 240, 280];
    const tried = sizes.map((n) => {
      const out = run({ 'policy.targetHerdSize': n });
      return { n, s: out.summary, peak: out.summary.peakHerd };
    });
    const top = tried.reduce((a, x) => (x.s.finalBookEquity > a.s.finalBookEquity ? x : a));
    // El punto de frenar no es el máximo exacto sino donde la curva se aplana: el hato más
    // chico que ya llega al 99% del mejor patrimonio, porque crecer más no paga.
    const plateau = tried.find((x) => x.s.finalBookEquity >= top.s.finalBookEquity * 0.99) ?? top;
    // Y el mes en que la finca base llega a ese tamaño es la señal práctica de «hasta aquí».
    const reach = b.months.findIndex((m) => m.herd.total >= plateau.n);
    answers.push({
      id: 'frenar-crecimiento',
      question: '¿En qué momento debería frenar el crecimiento?',
      headline:
        reach >= 0
          ? `A partir de ${decimals(plateau.n, 0)} cabezas crecer ya casi no paga; la finca llega ahí en el mes ${reach + 1}.`
          : `El patrimonio sigue subiendo hasta ${decimals(plateau.n, 0)} cabezas, que la finca no alcanza en diez años: con esta pastura no hay que frenar nada, hay que crecer más rápido.`,
      rows: [
        { label: 'Objetivo configurado', value: `${decimals(current, 0)} cabezas` },
        { label: 'Tamaño donde la curva se aplana', value: `${decimals(plateau.n, 0)} cabezas`, key: true },
        { label: 'Patrimonio ahí', value: money(plateau.s.finalBookEquity), key: true },
        {
          label: 'Máximo del barrido',
          value: `${decimals(top.n, 0)} cabezas → ${money(top.s.finalBookEquity)}`,
        },
        {
          label: 'Mes en que se alcanza',
          value: reach >= 0 ? `mes ${reach + 1}` : 'no se alcanza en 10 años',
        },
        { label: 'Δ contra el objetivo actual', value: money(plateau.s.finalBookEquity - s0.finalBookEquity) },
        { label: 'Hato máximo que logra la finca', value: `${decimals(top.peak, 0)} cabezas` },
        {
          label: 'Hectáreas disponibles',
          value: `${decimals(val('feed.hectares') + val('feed.rentedHectares'), 0)} ha`,
        },
      ],
      method:
        'Barrido de `policy.targetHerdSize` entre 80 y 280 cabezas. Se reporta el hato más pequeño que ya alcanza el 99% del mejor patrimonio: pasado ese punto crecer aporta menos que el riesgo que suma.',
    });
  }

  // 12 — cuándo vender para proteger la liquidez -------------------------------------------
  {
    const buffer = val('capital.minCashBuffer');
    const heifer = val('prices.heiferPricePerHead');
    const out = run(
      { 'policy.destockOnCashTrigger': 0, 'policy.capitalCallEnabled': 0 },
      stack.overrides,
    );
    const warning = out.months.findIndex((m) => m.cash.balance < buffer);
    const dry = out.months.findIndex((m) => m.cash.balance < 0);
    const trough = out.months.reduce((a, m) => Math.min(a, m.cash.balance), Infinity);
    const gap = warning >= 0 ? buffer - out.months[warning].cash.balance : 0;
    const deep = Math.max(0, buffer - trough);
    const withDestock = run({ 'policy.capitalCallEnabled': 0 }, stack.overrides).summary;
    // Si tapar el bache pide más animales de los que hay, el problema no es de liquidez:
    // vender ganado compra tiempo, no arregla una estructura de costos rota.
    const available = warning >= 0 ? out.months[warning].herd.total : s0.finalHerd;
    const deepHeads = Math.ceil(deep / heifer);
    const structural = deepHeads > available;
    answers.push({
      id: 'cuando-vender',
      question: '¿Cuándo conviene vender animales para proteger la liquidez?',
      headline:
        warning >= 0
          ? `Bajo «${stack.labels.join(' + ')}» y sin desmontar hato, la caja rompe el colchón en el mes ${warning + 1}: esa es la señal para vender. Con ${decimals(Math.ceil(gap / heifer), 0)} novillas se tapa ese mes. ${
              structural
                ? `Cubrir todo el bache pediría ${decimals(deepHeads, 0)} cabezas, más de las ${decimals(available, 0)} que hay: vender compra tiempo, no arregla el hueco.`
                : `Con ${decimals(deepHeads, 0)} se cubre el bache entero.`
            }`
          : `Ni con «${stack.labels.join(' + ')}» encima hace falta vender: la caja toca fondo en ${money(trough)} y nunca baja del colchón.`,
      rows: [
        { label: 'Escenario de referencia', value: stack.labels.join(' + ') },
        { label: 'Colchón mínimo', value: money(buffer) },
        {
          label: 'Primer mes bajo el colchón',
          value: warning >= 0 ? `mes ${warning + 1}` : 'ninguno',
          key: true,
        },
        { label: 'Primer mes en rojo', value: dry >= 0 ? `mes ${dry + 1}` : 'ninguno' },
        { label: 'Caja mínima sin vender nada', value: money(trough) },
        {
          label: 'Novillas a vender en la señal',
          value: warning >= 0 ? `${decimals(Math.ceil(gap / heifer), 0)} a ${money(heifer)} c/u` : '—',
          key: true,
        },
        {
          label: 'Novillas para cubrir todo el bache',
          value:
            deep <= 0
              ? '—'
              : `${decimals(deepHeads, 0)}${structural ? ` (no alcanza el hato: hay ${decimals(available, 0)})` : ''}`,
        },
        {
          label: 'Patrimonio si el motor desmonta solo',
          value: money(withDestock.finalBookEquity),
        },
      ],
      method:
        'La pila de crisis se corre con `destockOnCashTrigger` apagado para ver cuándo caería la caja si nadie hace nada. La señal de venta es el primer mes bajo el colchón; el faltante se traduce a novillas al precio configurado.',
    });
  }

  // 13 — qué inversión reduce más el riesgo ------------------------------------------------
  {
    const cash = val('capital.initialCash');
    const budget = 20000;
    const withoutCall = { 'policy.capitalCallEnabled': 0 };
    const reference = run(
      { ...withoutCall, 'capital.initialCash': cash - budget },
      stack.overrides,
    ).summary;

    const options: { label: string; edits: Record<string, number> }[] = [
      {
        label: 'Reserva de forraje (silo): pastura +12%',
        edits: { 'feed.dmPerHaMonth': val('feed.dmPerHaMonth') * 1.12 },
      },
      {
        label: 'Riego: menos estacionalidad, +8% de pastura',
        edits: { 'feed.dmPerHaMonth': val('feed.dmPerHaMonth') * 1.08, 'feed.utilizationPct': Math.min(0.95, val('feed.utilizationPct') + 0.05) },
      },
      {
        label: 'Plan sanitario: mortalidad de becerros −40%',
        edits: { 'health.calfMortalityToWeaning': val('health.calfMortalityToWeaning') * 0.6 },
      },
      {
        label: 'Mejora reproductiva: concepción +15%',
        edits: { 'repro.monthlyConceptionRate': Math.min(0.6, val('repro.monthlyConceptionRate') * 1.15) },
      },
      {
        label: 'Venta directa: más litros al canal caro',
        edits: {
          'channels.directShare': Math.min(1, val('channels.directShare') + 0.15),
          'channels.industryShare': Math.max(0, val('channels.industryShare') - 0.15),
        },
      },
      { label: 'Dejar los $20.000 en caja', edits: { 'capital.initialCash': cash } },
    ];

    const scored = options
      .map((o) => {
        const s = run(
          { ...withoutCall, 'capital.initialCash': cash - budget, ...o.edits },
          stack.overrides,
        ).summary;
        return {
          label: o.label,
          equity: s.finalBookEquity - reference.finalBookEquity,
          insolvent: s.monthsInsolvent - reference.monthsInsolvent,
        };
      })
      .sort((a, b) => b.equity - a.equity);

    answers.push({
      id: 'inversion-riesgo',
      question: '¿Qué inversión reduce más el riesgo?',
      headline: `Con ${money(budget)} disponibles y la finca bajo «${stack.labels.join(' + ')}», ${scored[0].label.toLowerCase()} es lo que más protege: ${money(scored[0].equity)} de patrimonio sobre no hacer nada.`,
      rows: scored.map((r, i) => ({
        label: `${i + 1}. ${r.label}`,
        value: `${money(r.equity)} patrimonio${r.insolvent !== 0 ? ` · ${decimals(r.insolvent, 0)} meses insolventes` : ''}`,
        key: i === 0,
      })),
      method:
        'Cada opción se paga sacando $20.000 de la caja inicial y se juzga bajo la pila de crisis de la pregunta 10 con el aporte de capital apagado, contra la misma finca descapitalizada sin invertir.',
      caveat:
        'Los efectos de cada inversión son supuestos de ingeniería, no cotizaciones: cámbialos en el panel si tienes números propios.',
    });
  }

  // 14 — patrimonio perdido al liquidar en un año concreto ---------------------------------
  {
    const rows: AnswerRow[] = [];
    let worst = { year: 0, gap: 0 };
    let best = { year: 0, gap: -Infinity };
    for (let year = 1; year <= 10; year++) {
      const m = b.months[year * 12 - 1];
      const gap = m.balance.liquidationEquity - m.balance.bookEquity;
      if (gap < worst.gap) worst = { year, gap };
      if (gap > best.gap) best = { year, gap };
      rows.push({
        label: `Año ${year}`,
        value: `contable ${money(m.balance.bookEquity)} · liquidación ${money(m.balance.liquidationEquity)} · brecha ${money(gap)}`,
      });
    }
    answers.push({
      id: 'liquidar-por-ano',
      question: '¿Cuánto patrimonio perdería si liquido el negocio en un año específico?',
      headline:
        worst.year === 0
          ? `Liquidar nunca cuesta patrimonio en este escenario: el hato vale más en el mercado que en los libros, y en el año ${best.year} la venta deja ${money(best.gap)} por encima del contable.`
          : `El peor año para liquidar es el ${worst.year}: se dejan ${money(Math.abs(worst.gap))} sobre la mesa. El mejor es el ${best.year}, con ${money(best.gap)} de diferencia.`,
      rows,
      method: `Patrimonio contable contra patrimonio de liquidación al cierre de cada año, con el descuento de realización de ${pct(val('prices.liquidationHaircutPct'), 0)} aplicado al hato y a los activos fijos.`,
    });
  }

  // 15 — patrimonio contable vs realizable -------------------------------------------------
  {
    const gap = s0.finalLiquidationEquity - s0.finalBookEquity;
    const last = b.months[b.months.length - 1].balance;
    answers.push({
      id: 'contable-vs-realizable',
      question: '¿Cuál es mi patrimonio contable y cuál es mi patrimonio realizable?',
      headline: `A diez años el patrimonio contable es ${money(s0.finalBookEquity)} y el realizable ${money(s0.finalLiquidationEquity)}: ${gap >= 0 ? 'sobran' : 'faltan'} ${money(Math.abs(gap))}.`,
      rows: [
        { label: 'Patrimonio contable', value: money(s0.finalBookEquity), key: true },
        { label: 'Patrimonio de liquidación', value: money(s0.finalLiquidationEquity), key: true },
        { label: 'Brecha', value: money(gap) },
        { label: 'Hato a valor de mercado', value: money(last.herdValueMarket) },
        { label: 'Hato a valor de libros', value: money(last.herdValueBook) },
        { label: 'Activos fijos netos', value: money(last.fixedAssetsNet) },
        { label: 'Tierra', value: money(last.land) },
        { label: 'Caja', value: money(last.cash) },
        { label: 'Deuda', value: money(last.debt) },
      ],
      method:
        'El contable valora el hato al costo de libros; el realizable lo valora a precio de mercado y le aplica el descuento de venta forzada. La tierra y la caja entran igual en los dos.',
    });
  }

  return answers;
}
