import type { ScenarioOverride } from '@/engine/types';

/** Un evento sin `id`: el id se genera al colocarlo en el escenario. */
export type OverrideDraft = Omit<ScenarioOverride, 'id'>;

export interface EventPreset {
  id: string;
  label: string;
  /** Qué le pasa a la finca, en el idioma del productor. */
  description: string;
  tone: 'malo' | 'bueno';
  overrides: OverrideDraft[];
}

/**
 * Plantillas de un solo evento para la línea de tiempo. Arrancan pasado el primer año para
 * que la gráfica muestre el antes y el después: un evento en el mes 0 se confunde con la
 * finca base. Las crisis completas de varias variables a la vez son `STRESS_PRESETS`.
 */
export const EVENT_PRESETS: EventPreset[] = [
  {
    id: 'evento-sequia',
    label: 'Sequía severa',
    description: 'Seis meses sin lluvia: el potrero produce menos de la mitad y hay que comprar forraje caro.',
    tone: 'malo',
    overrides: [
      {
        label: 'Sequía: forraje del potrero',
        target: 'feed.dmPerHaMonth',
        op: 'multiply',
        value: 0.45,
        startMonth: 12,
        durationMonths: 6,
        rampInMonths: 2,
        recovery: { type: 'linear', months: 4 },
      },
      {
        label: 'Sequía: forraje comprado más caro',
        target: 'feed.purchasedForageCostPerKgDm',
        op: 'multiply',
        value: 1.7,
        startMonth: 12,
        durationMonths: 6,
        rampInMonths: 2,
        recovery: { type: 'linear', months: 4 },
      },
    ],
  },
  {
    id: 'sequia-leve',
    label: 'Sequía leve',
    description: 'Un verano seco normal: el pasto rinde un 25% menos durante tres meses.',
    tone: 'malo',
    overrides: [
      {
        label: 'Verano seco',
        target: 'feed.dmPerHaMonth',
        op: 'multiply',
        value: 0.75,
        startMonth: 12,
        durationMonths: 3,
        rampInMonths: 1,
        recovery: { type: 'linear', months: 2 },
        repeat: { everyMonths: 12, times: 10 },
      },
    ],
  },
  {
    id: 'caida-precio-leche',
    label: 'Caída del precio de la leche',
    description: 'La industria paga un 30% menos durante nueve meses y luego se recupera despacio.',
    tone: 'malo',
    overrides: [
      {
        label: 'Precio a industria −30%',
        target: 'channels.industryPricePerLiter',
        op: 'pctDelta',
        value: -0.3,
        startMonth: 12,
        durationMonths: 9,
        recovery: { type: 'linear', months: 6 },
      },
    ],
  },
  {
    id: 'concentrado-caro',
    label: 'Concentrado por las nubes',
    description: 'El alimento balanceado sube un 80% y no vuelve a bajar.',
    tone: 'malo',
    overrides: [
      {
        label: 'Concentrado +80%',
        target: 'feed.concentrateCostPerKg',
        op: 'pctDelta',
        value: 0.8,
        startMonth: 6,
        durationMonths: Number.POSITIVE_INFINITY,
        rampInMonths: 3,
      },
    ],
  },
  {
    id: 'brote-sanitario',
    label: 'Brote sanitario',
    description: 'Cuatro meses con el doble de mastitis y la mortalidad de vacas por las nubes.',
    tone: 'malo',
    overrides: [
      {
        label: 'Mortalidad de vacas ×2,5',
        target: 'health.cowMortalityAnnual',
        op: 'multiply',
        value: 2.5,
        startMonth: 18,
        durationMonths: 4,
        recovery: { type: 'linear', months: 3 },
      },
      {
        label: 'Mastitis ×2',
        target: 'health.mastitisIncidenceAnnual',
        op: 'multiply',
        value: 2,
        startMonth: 18,
        durationMonths: 4,
        recovery: { type: 'linear', months: 3 },
      },
    ],
  },
  {
    id: 'falla-reproductiva',
    label: 'Falla reproductiva',
    description: 'Las vacas dejan de quedar preñadas durante ocho meses. El golpe en el ordeño llega dos años después.',
    tone: 'malo',
    overrides: [
      {
        label: 'Concepción −40%',
        target: 'repro.monthlyConceptionRate',
        op: 'pctDelta',
        value: -0.4,
        startMonth: 12,
        durationMonths: 8,
        recovery: { type: 'linear', months: 4 },
      },
    ],
  },
  {
    id: 'mejora-reproductiva',
    label: 'Mejora reproductiva',
    description: 'Entra un programa de sincronización: más partos, más vacas en ordeño a partir del tercer año.',
    tone: 'bueno',
    overrides: [
      {
        label: 'Concepción +30%',
        target: 'repro.monthlyConceptionRate',
        op: 'pctDelta',
        value: 0.3,
        startMonth: 6,
        durationMonths: Number.POSITIVE_INFINITY,
        rampInMonths: 6,
      },
    ],
  },
  {
    id: 'inflacion-alta',
    label: 'Inflación de costos',
    description: 'Los costos empiezan a subir un 40% al año en vez del ritmo normal.',
    tone: 'malo',
    overrides: [
      {
        label: 'Inflación de costos al 40%',
        target: 'macro.costInflationAnnual',
        op: 'set',
        value: 0.4,
        startMonth: 6,
        durationMonths: Number.POSITIVE_INFINITY,
      },
    ],
  },
];

export const PRESETS_BY_ID = new Map(EVENT_PRESETS.map((p) => [p.id, p]));

/**
 * Prueba de estrés: una crisis completa, no un evento suelto. Son las ocho del documento
 * (líneas 229-240) y cada una monta varios overrides a la vez, porque una sequía real no
 * mueve solo el pasto: también encarece el forraje que hay que comprar para taparla.
 */
export interface StressPreset {
  id: string;
  label: string;
  /** Qué le pasa a la finca, en el idioma del productor. */
  description: string;
  /** La pregunta que contesta, para el encabezado de la tarjeta. */
  question: string;
  overrides: OverrideDraft[];
}

const PERMANENT = Number.POSITIVE_INFINITY;

export const STRESS_PRESETS: StressPreset[] = [
  {
    id: 'sequia-severa',
    label: 'Sequía severa',
    description:
      'Siete meses con el potrero al 40% de lo normal y el forraje comprado casi al doble de precio. Se recupera despacio durante cinco meses más.',
    question: '¿Y si se pierde la lluvia siete meses seguidos?',
    overrides: [
      {
        label: 'Sequía: el potrero rinde 60% menos',
        target: 'feed.dmPerHaMonth',
        op: 'multiply',
        value: 0.4,
        startMonth: 12,
        durationMonths: 7,
        rampInMonths: 1,
        recovery: { type: 'linear', months: 5 },
      },
      {
        label: 'Sequía: el forraje comprado se encarece 90%',
        target: 'feed.purchasedForageCostPerKgDm',
        op: 'multiply',
        value: 1.9,
        startMonth: 12,
        durationMonths: 7,
        rampInMonths: 1,
        recovery: { type: 'linear', months: 5 },
      },
    ],
  },
  {
    id: 'colapso-precio-leche',
    label: 'Colapso del precio de la leche',
    description:
      'El precio cae 40% en todos los canales durante un año entero y tarda nueve meses más en volver a su nivel.',
    question: '¿Y si el precio se desploma y tarda en volver?',
    overrides: [
      {
        label: 'Precio de la leche −40%',
        target: 'milk.priceIndex',
        op: 'set',
        value: 0.6,
        startMonth: 12,
        durationMonths: 12,
        recovery: { type: 'linear', months: 9 },
      },
    ],
  },
  {
    id: 'epidemia',
    label: 'Epidemia',
    description:
      'Diez meses de brote: mueren cuatro de cada diez becerros, la mortalidad de vacas y novillas se multiplica por seis, se disparan los abortos, la mastitis y el gasto veterinario.',
    question: '¿Y si entra una enfermedad al hato?',
    overrides: [
      {
        label: 'Mortalidad de becerros al 40%',
        target: 'health.calfMortalityToWeaning',
        op: 'set',
        value: 0.4,
        startMonth: 18,
        durationMonths: 10,
        recovery: { type: 'linear', months: 8 },
      },
      {
        label: 'Mortalidad de vacas ×6',
        target: 'health.cowMortalityAnnual',
        op: 'multiply',
        value: 6,
        startMonth: 18,
        durationMonths: 10,
        recovery: { type: 'linear', months: 8 },
      },
      {
        label: 'Mortalidad de novillas ×6',
        target: 'health.heiferMortalityAnnual',
        op: 'multiply',
        value: 6,
        startMonth: 18,
        durationMonths: 10,
        recovery: { type: 'linear', months: 8 },
      },
      {
        label: 'Abortos al 25%',
        target: 'repro.abortionRatePerPregnancy',
        op: 'set',
        value: 0.25,
        startMonth: 18,
        durationMonths: 10,
        recovery: { type: 'linear', months: 8 },
      },
      {
        label: 'Mastitis ×3',
        target: 'health.mastitisIncidenceAnnual',
        op: 'multiply',
        value: 3,
        startMonth: 18,
        durationMonths: 10,
        recovery: { type: 'linear', months: 6 },
      },
      {
        label: 'Gasto veterinario ×3',
        target: 'health.vetCostPerCowYear',
        op: 'multiply',
        value: 3,
        startMonth: 18,
        durationMonths: 12,
        recovery: { type: 'linear', months: 4 },
      },
    ],
  },
  {
    id: 'robo-significativo',
    label: 'Robo significativo',
    description:
      'Un año de abigeato y sustracción: desaparece ganado del potrero y se pierde el 12% de todo lo que se produce entre leche, insumos y combustible.',
    question: '¿Y si me roban ganado y producción durante un año?',
    overrides: [
      {
        label: 'Pérdidas por robo: 12% de los ingresos',
        target: 'costs.lossPct',
        op: 'set',
        value: 0.12,
        startMonth: 9,
        durationMonths: 12,
        recovery: { type: 'linear', months: 6 },
      },
      {
        label: 'Abigeato: 18% anual de bajas adicionales',
        target: 'health.cowMortalityAnnual',
        op: 'add',
        value: 0.18,
        startMonth: 9,
        durationMonths: 12,
        recovery: { type: 'linear', months: 3 },
      },
    ],
  },
  {
    id: 'falla-infraestructura',
    label: 'Falla de infraestructura',
    description:
      'Se daña el pozo y se queda la finca sin electricidad: tres meses rechazando leche por falta de frío, reparaciones que multiplican por siete el mantenimiento y medio año de potreros sin riego.',
    question: '¿Y si se cae el pozo, la bomba y la luz a la vez?',
    overrides: [
      {
        label: 'Sin frío: 30% de la leche rechazada',
        target: 'milk.rejectPct',
        op: 'set',
        value: 0.3,
        startMonth: 15,
        durationMonths: 3,
        recovery: { type: 'linear', months: 2 },
      },
      {
        label: 'Reparación de pozo y bombas: mantenimiento ×7',
        target: 'costs.maintenanceMonthly',
        op: 'multiply',
        value: 7,
        startMonth: 15,
        durationMonths: 3,
        recovery: { type: 'immediate', months: 0 },
      },
      {
        label: 'Potreros sin agua: 15% menos de pasto',
        target: 'feed.dmPerHaMonth',
        op: 'multiply',
        value: 0.85,
        startMonth: 15,
        durationMonths: 6,
        recovery: { type: 'linear', months: 3 },
      },
    ],
  },
  {
    id: 'inflacion-costos',
    label: 'Inflación de costos',
    description:
      'Los costos pasan a subir 12% al año en dólares, cuatro veces el ritmo normal y para siempre, y encima el concentrado da un salto del 35%. Los ingresos no siguen.',
    question: '¿Y si los costos se disparan y los precios no?',
    overrides: [
      {
        label: 'Inflación de costos al 12% anual',
        target: 'macro.costInflationAnnual',
        op: 'set',
        value: 0.12,
        startMonth: 6,
        durationMonths: PERMANENT,
      },
      {
        label: 'Concentrado +35%',
        target: 'feed.concentrateCostPerKg',
        op: 'pctDelta',
        value: 0.35,
        startMonth: 6,
        durationMonths: PERMANENT,
        rampInMonths: 3,
      },
    ],
  },
  {
    id: 'combinacion-crisis',
    label: 'Combinación de crisis',
    description:
      'Las cuatro a la vez, como en el documento: la leche baja 20%, el alimento sube 30%, la mortalidad de becerros llega al 12% y caen siete meses de sequía. El daño conjunto es peor que la suma de los cuatro por separado.',
    question: '¿Y si me pasa todo al mismo tiempo?',
    overrides: [
      {
        label: 'Precio de la leche −20%',
        target: 'milk.priceIndex',
        op: 'pctDelta',
        value: -0.2,
        startMonth: 12,
        durationMonths: 12,
        recovery: { type: 'linear', months: 6 },
      },
      {
        label: 'Concentrado +30%',
        target: 'feed.concentrateCostPerKg',
        op: 'pctDelta',
        value: 0.3,
        startMonth: 12,
        durationMonths: PERMANENT,
        rampInMonths: 2,
      },
      {
        label: 'Forraje comprado +30%',
        target: 'feed.purchasedForageCostPerKgDm',
        op: 'pctDelta',
        value: 0.3,
        startMonth: 12,
        durationMonths: PERMANENT,
        rampInMonths: 2,
      },
      {
        label: 'Mortalidad de becerros al 12%',
        target: 'health.calfMortalityToWeaning',
        op: 'set',
        value: 0.12,
        startMonth: 12,
        durationMonths: 12,
        recovery: { type: 'linear', months: 6 },
      },
      {
        label: 'Sequía de siete meses',
        target: 'feed.dmPerHaMonth',
        op: 'multiply',
        value: 0.5,
        startMonth: 12,
        durationMonths: 7,
        rampInMonths: 1,
        recovery: { type: 'linear', months: 4 },
      },
    ],
  },
  {
    id: 'perdida-comprador',
    label: 'Pérdida del comprador principal',
    description:
      'La planta deja de recibir: hay que colocar la leche con intermediarios un 28% más barato y durante medio año se pierde una quinta parte por falta de salida.',
    question: '¿Y si mañana la planta deja de comprarme?',
    overrides: [
      {
        label: 'Precio a industria −28%',
        target: 'channels.industryPricePerLiter',
        op: 'pctDelta',
        value: -0.28,
        startMonth: 10,
        durationMonths: 14,
        recovery: { type: 'linear', months: 8 },
      },
      {
        label: 'Leche sin salida: 22% rechazada',
        target: 'milk.rejectPct',
        op: 'set',
        value: 0.22,
        startMonth: 10,
        durationMonths: 6,
        recovery: { type: 'linear', months: 8 },
      },
    ],
  },
];

export const STRESS_BY_ID = new Map(STRESS_PRESETS.map((p) => [p.id, p]));

export const instantiate = (draft: OverrideDraft): ScenarioOverride => ({
  ...draft,
  id: crypto.randomUUID(),
});
