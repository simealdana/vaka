import type { Assumptions, ScenarioOverride, SimulationOutput } from '@/engine/types';
import { VARIABLES_BY_PATH } from '@/lib/assumptions/schema';
import { formatValue, money, pct, signedPct } from '@/lib/format';
import type { EditMap } from '@/lib/state/useAssumptionsStore';
import { type LossBreakdown, classifyLoss } from './ledger';
import { type Findings, deriveFindings } from './metrics';
import { type Remedy, deriveRemedies } from './remedies';

export type Severity = 'good' | 'info' | 'warn' | 'danger';

export interface NarrativeItem {
  id: string;
  text: string;
  severity: Severity;
}

export interface NarrativeSection {
  id: 'que-cambio' | 'caja' | 'patrimonio' | 'que-hacer';
  title: string;
  items: NarrativeItem[];
}

export interface Explanation {
  findings: Findings;
  loss: LossBreakdown;
  remedies: Remedy[];
  sections: NarrativeSection[];
}

interface Context {
  f: Findings;
  loss: LossBreakdown;
  remedies: Remedy[];
  a: Assumptions;
}

interface Rule {
  id: string;
  section: NarrativeSection['id'];
  priority: number;
  when: (c: Context) => boolean;
  render: (c: Context) => { text: string; severity: Severity };
}

const monthName = (m: number) => `mes ${m + 1}`;

const RULES: Rule[] = [
  // --- Qué cambió ----------------------------------------------------------
  {
    id: 'sin-cambios',
    section: 'que-cambio',
    priority: 0,
    when: (c) => c.f.changed.length === 0 && c.f.events.length === 0,
    render: () => ({
      text: 'No modificaste ningún supuesto: esto es la finca base tal como la describiste.',
      severity: 'info',
    }),
  },
  {
    id: 'eventos',
    section: 'que-cambio',
    priority: 20,
    when: (c) => c.f.events.length > 0,
    render: (c) => ({
      text: c.f.events
        .map((e) =>
          Number.isFinite(e.durationMonths)
            ? `${e.label}: desde el ${monthName(e.startMonth)} durante ${e.durationMonths} meses`
            : `${e.label}: desde el ${monthName(e.startMonth)}, de forma permanente`,
        )
        .join(' · '),
      severity: 'info',
    }),
  },
  {
    id: 'ingresos',
    section: 'que-cambio',
    priority: 30,
    when: (c) => Math.abs(c.f.revenueDeltaPerMonth) > 1,
    render: (c) => {
      const down = c.f.revenueDeltaPerMonth < 0;
      return {
        text: `Tus ingresos ${down ? 'caen' : 'suben'} ${money(Math.abs(c.f.revenueDeltaPerMonth))} al mes en promedio durante los ${c.f.affectedMonths} meses afectados.`,
        severity: down ? 'warn' : 'good',
      };
    },
  },
  {
    id: 'costos',
    section: 'que-cambio',
    priority: 31,
    when: (c) => Math.abs(c.f.costDeltaPerMonth) > 1,
    render: (c) => {
      const up = c.f.costDeltaPerMonth > 0;
      return {
        text: `Los costos ${up ? 'suben' : 'bajan'} ${money(Math.abs(c.f.costDeltaPerMonth))} al mes.`,
        severity: up ? 'warn' : 'good',
      };
    },
  },
  {
    id: 'leche',
    section: 'que-cambio',
    priority: 40,
    when: (c) => c.f.milkDeltaPct !== null && Math.abs(c.f.milkDeltaPct) > 0.01,
    render: (c) => ({
      text: `La leche vendida en diez años cambia ${signedPct(c.f.milkDeltaPct ?? 0, 1)} y el costo por litro ${c.f.costPerLiterDelta >= 0 ? 'sube' : 'baja'} $${Math.abs(c.f.costPerLiterDelta).toFixed(3)}.`,
      severity: (c.f.milkDeltaPct ?? 0) < 0 ? 'warn' : 'good',
    }),
  },
  {
    id: 'hato',
    section: 'que-cambio',
    priority: 45,
    when: (c) => c.f.herdDeltaPct !== null && Math.abs(c.f.herdDeltaPct) > 0.02,
    render: (c) => ({
      text: `El hato final queda ${signedPct(c.f.herdDeltaPct ?? 0, 1)} respecto a la finca base: el efecto sobre los animales llega años después del golpe.`,
      severity: (c.f.herdDeltaPct ?? 0) < 0 ? 'warn' : 'good',
    }),
  },

  // --- Efecto en la caja ---------------------------------------------------
  {
    id: 'caja-aguanta',
    section: 'caja',
    priority: 10,
    when: (c) => c.f.firstBelowBufferMonth === null,
    render: (c) => ({
      text: `La caja nunca baja del colchón de ${money(c.a.capital.minCashBuffer)}; el punto más bajo es ${money(c.loss.risk.minCash)}.`,
      severity: 'good',
    }),
  },
  {
    id: 'colchon',
    section: 'caja',
    priority: 11,
    when: (c) => c.f.firstBelowBufferMonth !== null,
    render: (c) => ({
      text: `Absorbes el golpe ${c.f.firstBelowBufferMonth} meses con la caja que tienes; en el ${monthName(c.f.firstBelowBufferMonth ?? 0)} caes por debajo del colchón mínimo.`,
      severity: 'warn',
    }),
  },
  {
    id: 'quiebre',
    section: 'caja',
    priority: 12,
    when: (c) => c.f.firstNegativeCashMonth !== null,
    render: (c) => ({
      text: `En el ${monthName(c.f.firstNegativeCashMonth ?? 0)} te quedas sin liquidez: el faltante máximo llega a ${money(c.f.maxDeficit)}.`,
      severity: 'danger',
    }),
  },
  {
    id: 'insolvencia',
    section: 'caja',
    priority: 13,
    when: (c) => c.f.monthsInsolvent > 0,
    render: (c) => ({
      text: `${c.f.monthsInsolvent} meses del horizonte quedan insolventes.`,
      severity: 'danger',
    }),
  },
  {
    id: 'caja-vs-base',
    section: 'caja',
    priority: 14,
    when: (c) => Math.abs(c.loss.cash) > 500,
    render: (c) => ({
      text: `Frente a la finca base, el punto más bajo de la caja empeora ${money(Math.abs(c.loss.cash))}.`,
      severity: c.loss.cash < 0 ? 'warn' : 'good',
    }),
  },

  // --- Efecto en el patrimonio --------------------------------------------
  {
    id: 'patrimonio',
    section: 'patrimonio',
    priority: 10,
    when: (c) => Math.abs(c.loss.equity) > 500,
    render: (c) => ({
      text: `El patrimonio contable a diez años ${c.loss.equity < 0 ? 'baja' : 'sube'} ${money(Math.abs(c.loss.equity))}${c.f.equityDeltaPct !== null ? ` (${signedPct(c.f.equityDeltaPct, 1)})` : ''}.`,
      severity: c.loss.equity < 0 ? 'danger' : 'good',
    }),
  },
  {
    id: 'contable-vs-caja',
    section: 'patrimonio',
    priority: 20,
    when: (c) => Math.abs(c.loss.accounting) > 500,
    render: (c) => {
      // Que la utilidad y el patrimonio se muevan igual no es redundancia: significa que
      // ningún activo se revaluó, y eso merece decirse en lugar de repetir la cifra.
      const same = Math.abs(c.loss.accounting - c.loss.equity) < Math.abs(c.loss.equity) * 0.01;
      return {
        text: same
          ? `La utilidad neta acumulada cae exactamente lo mismo: la pérdida es de resultados, no hay ningún activo que se haya revaluado para compensarla.`
          : `La utilidad neta acumulada cambia ${money(c.loss.accounting)}: incluye la depreciación y los animales muertos, que no pasan por la caja.`,
        severity: c.loss.accounting < 0 ? 'warn' : 'good',
      };
    },
  },
  {
    id: 'convertido',
    section: 'patrimonio',
    priority: 30,
    when: (c) => c.loss.convertedToAssets > 1000,
    render: (c) => ({
      text: `Invertiste ${money(c.loss.convertedToAssets)} que no perdiste: se convirtieron en ganado e instalaciones, el equivalente a ${Math.round(c.loss.heifersEquivalent)} novillas al precio de hoy.`,
      severity: 'info',
    }),
  },
  {
    id: 'oportunidad',
    section: 'patrimonio',
    priority: 40,
    when: (c) => Math.abs(c.loss.opportunityCost) > 1000,
    render: (c) => ({
      text:
        c.loss.opportunityCost > 0
          ? `Ese mismo capital al ${pct(c.a.capital.discountRateAnnual)} anual habría rendido ${money(c.loss.opportunityCost)} más que la finca.`
          : `La finca supera en ${money(-c.loss.opportunityCost)} lo que ese capital habría rendido al ${pct(c.a.capital.discountRateAnnual)} anual.`,
      severity: c.loss.opportunityCost > 0 ? 'warn' : 'good',
    }),
  },
  {
    id: 'liquidacion',
    section: 'patrimonio',
    priority: 50,
    // Solo aporta algo cuando liquidar duele distinto que seguir: si ambas cifras coinciden,
    // el golpe fue a la caja y no al valor del hato, y la línea sobra.
    when: (c) =>
      Math.abs(c.f.liquidationDelta - c.loss.equity) > Math.max(500, Math.abs(c.loss.equity) * 0.02),
    render: (c) => ({
      text: `Si tuvieras que liquidar, el patrimonio realizable cambia ${money(c.f.liquidationDelta)} frente a ${money(c.loss.equity)} del contable: el hato vale distinto vendido a la fuerza que en los libros.`,
      severity: 'info',
    }),
  },
  {
    id: 'tir',
    section: 'patrimonio',
    priority: 60,
    when: (c) => c.f.irrDelta !== null && Math.abs(c.f.irrDelta) > 0.002,
    render: (c) => ({
      text: `La TIR anual se mueve ${signedPct(c.f.irrDelta ?? 0, 1)} en puntos.`,
      severity: (c.f.irrDelta ?? 0) < 0 ? 'warn' : 'good',
    }),
  },
];

function changedVariablesItem(f: Findings): NarrativeItem | null {
  if (f.changed.length === 0) return null;
  const parts = f.changed.slice(0, 6).map((v) => {
    const spec = VARIABLES_BY_PATH.get(v.path);
    const from = spec ? formatValue(v.from, spec) : String(v.from);
    const to = spec ? formatValue(v.to, spec) : String(v.to);
    const delta = v.deltaPct === null ? '' : ` (${signedPct(v.deltaPct)})`;
    return `${v.label}: ${from} → ${to}${delta}`;
  });
  const rest = f.changed.length - parts.length;
  return {
    id: 'variables',
    text: parts.join(' · ') + (rest > 0 ? ` · y ${rest} más` : ''),
    severity: 'info',
  };
}

const TITLES: Record<NarrativeSection['id'], string> = {
  'que-cambio': 'Qué cambió',
  caja: 'Efecto en la caja',
  patrimonio: 'Efecto en el patrimonio',
  'que-hacer': 'Qué hacer',
};

export function buildExplanation(
  base: SimulationOutput,
  scenario: SimulationOutput,
  a: Assumptions,
  edits: EditMap,
  overrides: ScenarioOverride[],
): Explanation {
  const f = deriveFindings(base, scenario, a, edits, overrides);
  const loss = classifyLoss(base, scenario, a, f);
  const remedies = deriveRemedies(f, a, scenario);
  const ctx: Context = { f, loss, remedies, a };

  const sections: NarrativeSection[] = (
    ['que-cambio', 'caja', 'patrimonio', 'que-hacer'] as const
  ).map((id) => {
    const items: NarrativeItem[] = [];
    if (id === 'que-cambio') {
      const changed = changedVariablesItem(f);
      if (changed) items.push(changed);
    }
    if (id === 'que-hacer') {
      items.push(
        ...remedies.map((r) => ({
          id: r.id,
          text: `${r.title}. ${r.detail}`,
          severity: (r.id === 'ninguna' ? 'good' : 'info') as Severity,
        })),
      );
    }
    items.push(
      ...RULES.filter((r) => r.section === id && r.when(ctx))
        .sort((x, y) => x.priority - y.priority)
        .map((r) => ({ id: r.id, ...r.render(ctx) })),
    );
    return { id, title: TITLES[id], items };
  });

  return { findings: f, loss, remedies, sections };
}
