import { ADULT_COW_WEIGHT_KG } from '@/engine/herd/cohorts';
import type { Assumptions, SimulationOutput } from '@/engine/types';
import { money } from '@/lib/format';
import type { Findings } from './metrics';

export interface Remedy {
  id: string;
  title: string;
  detail: string;
}

/** Precio medio de una cabeza vendible hoy: novilla o vaca de descarte. */
const avgHeadPrice = (a: Assumptions): number =>
  (a.prices.heiferPricePerHead + ADULT_COW_WEIGHT_KG * a.prices.cullCowPricePerKg) / 2;

export function deriveRemedies(
  findings: Findings,
  a: Assumptions,
  scenario: SimulationOutput,
): Remedy[] {
  const out: Remedy[] = [];
  const gap = findings.capitalNeeded;

  if (gap > 0) {
    out.push({
      id: 'aporte',
      title: `Aportar ${money(gap)}`,
      detail:
        findings.firstNegativeCashMonth === null
          ? 'Es el capital que el modelo tuvo que inyectar para que la caja nunca quedara en rojo.'
          : `El faltante aparece en el mes ${findings.firstNegativeCashMonth + 1}; conviene tenerlo comprometido antes.`,
    });

    const head = Math.ceil(gap / avgHeadPrice(a));
    out.push({
      id: 'vender',
      title: `Vender ${head} ${head === 1 ? 'animal' : 'animales'}`,
      detail: `A ${money(avgHeadPrice(a))} por cabeza entre novillas y vacas de descarte. Reduce el hato y con él la producción futura.`,
    });
  }

  const deficitWindow = findings.firstBelowBufferMonth;
  const deferrable = a.capital.capex.filter(
    (c) => deficitWindow !== null && c.month >= deficitWindow && c.amount > 0,
  );
  if (deferrable.length > 0) {
    const total = deferrable.reduce((s, c) => s + c.amount, 0);
    out.push({
      id: 'capex',
      title: `Diferir ${money(total)} de inversión`,
      detail: `${deferrable.map((c) => c.label).join(', ')}: caen dentro de la ventana de déficit y no son urgentes para ordeñar.`,
    });
  }

  if (findings.underfedMonths > 0) {
    out.push({
      id: 'carga',
      title: `Bajar la carga animal (${findings.underfedMonths} meses con déficit de forraje)`,
      detail: `La condición corporal toca ${findings.minBcs.toFixed(2)}. Menos bocas sobre la misma pastura protege la preñez, que es lo que sostiene el ordeño de dentro de tres años.`,
    });
  }

  const interest = scenario.months.reduce((s, m) => s + m.pnl.interest, 0);
  if (interest > Math.abs(findings.equityDelta) * 0.25 && interest > 0) {
    out.push({
      id: 'deuda',
      title: `Renegociar la deuda (${money(interest)} de intereses en el horizonte)`,
      detail: 'Los intereses pesan más que el propio golpe del escenario sobre el patrimonio.',
    });
  }

  if (out.length === 0) {
    out.push({
      id: 'ninguna',
      title: 'No hace falta ninguna acción de emergencia',
      detail: 'La caja aguanta el escenario completo sin bajar del colchón mínimo.',
    });
  }

  return out;
}
