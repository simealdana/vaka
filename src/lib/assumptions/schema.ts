import { DEFAULT_ASSUMPTIONS } from '@/engine/defaults';
import { getByPath } from '@/engine/scenario/resolve';
import type { Assumptions, ParamPath } from '@/engine/types';

/** Las siete categorías del documento, más el hato inicial y las políticas de manejo. */
export const GROUPS = [
  { id: 'adquisicion', label: 'Adquisición de la finca' },
  { id: 'hato', label: 'Hato y manejo' },
  { id: 'leche', label: 'Producción y venta de leche' },
  { id: 'sanidad', label: 'Mortalidad y sanidad' },
  { id: 'reproduccion', label: 'Reproducción' },
  { id: 'alimentacion', label: 'Alimentación y pasturas' },
  { id: 'personal', label: 'Personal y operación' },
  { id: 'infraestructura', label: 'Infraestructura' },
  { id: 'macro', label: 'Variables macroeconómicas' },
] as const;

export type GroupId = (typeof GROUPS)[number]['id'];

/**
 * `percent` se guarda como fracción (0.06) y se muestra como 6%. La conversión vive
 * en el formateo, nunca en el motor.
 */
export type VariableKind = 'number' | 'integer' | 'percent' | 'money' | 'boolean';

export interface MonteCarloSpec {
  dist: 'triangular' | 'lognormal';
  min: number;
  mode: number;
  max: number;
}

export interface VariableSpec {
  id: string;
  path: ParamPath;
  group: GroupId;
  label: string;
  unit?: string;
  kind: VariableKind;
  min: number;
  max: number;
  step: number;
  /** `destacada` es lo que ve el usuario antes de abrir "Todas". */
  tier: 'destacada' | 'avanzada';
  synonyms?: string[];
  help?: string;
  mc?: MonteCarloSpec;
}

const v = (spec: VariableSpec): VariableSpec => spec;

export const VARIABLES: VariableSpec[] = [
  // --- Adquisición de la finca ---------------------------------------------
  v({
    id: 'isPurchase', path: 'acquisition.isPurchase', group: 'adquisicion', kind: 'boolean',
    label: 'La finca se compra', min: 0, max: 1, step: 1, tier: 'destacada',
    synonyms: ['compra', 'adquisición', 'inversión inicial'],
    help: 'Encendido, la TIR se mide contra lo que desembolsas. Apagado, la finca ya es tuya y la referencia es lo que dejarías de cobrar si la vendieras hoy.',
  }),
  v({
    id: 'landCost', path: 'acquisition.landCost', group: 'adquisicion', kind: 'money',
    label: 'Pagado por el terreno', unit: 'USD', min: 0, max: 5000000, step: 1000, tier: 'destacada',
    synonyms: ['tierra', 'terreno', 'lote', 'compra de la finca'],
  }),
  v({
    id: 'herdCost', path: 'acquisition.herdCost', group: 'adquisicion', kind: 'money',
    label: 'Pagado por el hato', unit: 'USD', min: 0, max: 5000000, step: 1000, tier: 'destacada',
    synonyms: ['vacas', 'ganado', 'animales', 'compra de vacas'],
    help: 'Lo que costó el hato fundador completo: vacas, novillas, machos y toros.',
  }),
  v({
    id: 'infraCost', path: 'acquisition.infrastructureCost', group: 'adquisicion', kind: 'money',
    label: 'Pagado por instalaciones', unit: 'USD', min: 0, max: 5000000, step: 1000, tier: 'destacada',
    synonyms: ['corrales', 'sala de ordeño', 'cercas', 'maquinaria'],
  }),
  v({
    id: 'closingCost', path: 'acquisition.closingCost', group: 'adquisicion', kind: 'money',
    label: 'Gastos de cierre', unit: 'USD', min: 0, max: 500000, step: 500, tier: 'avanzada',
    synonyms: ['notaría', 'comisión', 'honorarios', 'registro'],
    help: 'Sale de la caja pero no crea activo, así que es pérdida de entrada.',
  }),

  // --- Hato y manejo -------------------------------------------------------
  v({
    id: 'cows', path: 'herd.cows', group: 'hato', kind: 'integer',
    label: 'Vacas', unit: 'cabezas', min: 0, max: 500, step: 1, tier: 'destacada',
    synonyms: ['hato', 'vientres', 'madres'],
    help: 'Vacas adultas al inicio. El motor las reparte en su distribución de equilibrio entre ordeño, secas y gestación.',
  }),
  v({
    id: 'heifers', path: 'herd.heifers', group: 'hato', kind: 'integer',
    label: 'Hembras de levante', unit: 'cabezas', min: 0, max: 500, step: 1, tier: 'destacada',
    synonyms: ['novillas', 'becerras', 'reemplazo'],
    help: 'Todas las hembras desde el nacimiento hasta el primer parto.',
  }),
  v({
    id: 'males', path: 'herd.males', group: 'hato', kind: 'integer',
    label: 'Machos en levante', unit: 'cabezas', min: 0, max: 300, step: 1, tier: 'avanzada',
    synonyms: ['becerros', 'mautes'],
  }),
  v({
    id: 'bulls', path: 'herd.bulls', group: 'hato', kind: 'integer',
    label: 'Toros', unit: 'cabezas', min: 0, max: 30, step: 1, tier: 'avanzada',
    synonyms: ['padrotes', 'sementales'],
  }),
  v({
    id: 'targetHerdSize', path: 'policy.targetHerdSize', group: 'hato', kind: 'integer',
    label: 'Tope de hato', unit: 'cabezas', min: 0, max: 600, step: 5, tier: 'destacada',
    synonyms: ['capacidad', 'carga', 'límite'],
    help: 'Al superarlo se venden novillas excedentes. 0 = sin tope, el hato crece sin freno y termina comprando forraje todo el año.',
  }),
  v({
    id: 'retainAllHeifers', path: 'policy.retainAllHeifers', group: 'hato', kind: 'boolean',
    label: 'Retener todas las hembras', min: 0, max: 1, step: 1, tier: 'destacada',
    synonyms: ['reemplazo', 'crecer'],
    help: 'Si se desactiva, se vende al destete la fracción indicada abajo.',
  }),
  v({
    id: 'heiferSaleSharePct', path: 'policy.heiferSaleSharePct', group: 'hato', kind: 'percent',
    label: 'Hembras vendidas al destete', unit: '%', min: 0, max: 1, step: 0.05, tier: 'avanzada',
    synonyms: ['venta', 'destete'],
  }),
  v({
    id: 'maleSaleAgeMonths', path: 'policy.maleSaleAgeMonths', group: 'hato', kind: 'integer',
    label: 'Edad de venta de machos', unit: 'meses', min: 1, max: 30, step: 1, tier: 'destacada',
    synonyms: ['becerros', 'mautes', 'venta'],
  }),
  v({
    id: 'matureCullRateAtDryoff', path: 'policy.matureCullRateAtDryoff', group: 'hato', kind: 'percent',
    label: 'Descarte voluntario al secado', unit: '%', min: 0, max: 0.5, step: 0.01, tier: 'avanzada',
    synonyms: ['descarte', 'saca', 'eliminación'],
    help: 'Se aplica a las vacas de más partos en el momento del secado.',
  }),
  v({
    id: 'destockOnCashTrigger', path: 'policy.destockOnCashTrigger', group: 'hato', kind: 'boolean',
    label: 'Vender ganado si falta caja', min: 0, max: 1, step: 1, tier: 'avanzada',
    synonyms: ['liquidar', 'emergencia'],
  }),
  v({
    id: 'capitalCallEnabled', path: 'policy.capitalCallEnabled', group: 'hato', kind: 'boolean',
    label: 'Permitir aporte de capital', min: 0, max: 1, step: 1, tier: 'avanzada',
    synonyms: ['aporte', 'socio', 'inyección'],
    help: 'Si se desactiva, la caja puede quedar negativa y la finca se marca insolvente en vez de taparse el hueco.',
  }),

  // --- Producción y venta de leche -----------------------------------------
  v({
    id: 'litersPerCowDay', path: 'milk.litersPerCowDay', group: 'leche', kind: 'number',
    label: 'Litros por vaca al día', unit: 'L', min: 2, max: 25, step: 0.5, tier: 'destacada',
    synonyms: ['producción', 'rendimiento', 'leche'],
    help: 'Potencial en el pico de lactancia y con nutrición plena. La curva de lactancia y el balance nutricional lo modulan mes a mes.',
    mc: { dist: 'triangular', min: 6, mode: 8, max: 10 },
  }),
  v({
    id: 'industryPrice', path: 'channels.industryPricePerLiter', group: 'leche', kind: 'money',
    label: 'Precio a industria', unit: 'USD/L', min: 0.1, max: 2, step: 0.01, tier: 'destacada',
    synonyms: ['precio', 'litro', 'venta', 'planta', 'queso'],
    help: 'Precio neto pagado por litro puesto en planta, antes de la bonificación por calidad.',
    mc: { dist: 'triangular', min: 0.38, mode: 0.62, max: 0.82 },
  }),
  v({
    id: 'industryShare', path: 'channels.industryShare', group: 'leche', kind: 'percent',
    label: 'Reparto a industria', unit: '%', min: 0, max: 1, step: 0.05, tier: 'destacada',
    synonyms: ['canal', 'mix', 'reparto'],
  }),
  v({
    id: 'directShare', path: 'channels.directShare', group: 'leche', kind: 'percent',
    label: 'Reparto a venta directa', unit: '%', min: 0, max: 1, step: 0.05, tier: 'destacada',
    synonyms: ['canal', 'mix', 'menudeo'],
  }),
  v({
    id: 'directPrice', path: 'channels.directPricePerLiter', group: 'leche', kind: 'money',
    label: 'Precio de venta directa', unit: 'USD/L', min: 0.1, max: 3, step: 0.05, tier: 'destacada',
    synonyms: ['precio', 'menudeo'],
  }),
  v({
    id: 'directMax', path: 'channels.directMaxLitersMonth', group: 'leche', kind: 'integer',
    label: 'Tope de venta directa', unit: 'L/mes', min: 0, max: 50000, step: 100, tier: 'avanzada',
    synonyms: ['cupo', 'límite', 'menudeo'],
    help: 'Lo que no cabe en venta directa se desvía a la industria.',
  }),
  v({
    id: 'cheeseShare', path: 'channels.cheeseShare', group: 'leche', kind: 'percent',
    label: 'Reparto a queso', unit: '%', min: 0, max: 1, step: 0.05, tier: 'destacada',
    synonyms: ['canal', 'mix', 'transformación'],
  }),
  v({
    id: 'cheesePrice', path: 'channels.cheesePricePerKg', group: 'leche', kind: 'money',
    label: 'Precio del queso', unit: 'USD/kg', min: 1, max: 20, step: 0.1, tier: 'destacada',
    synonyms: ['queso', 'precio'],
    mc: { dist: 'triangular', min: 4.5, mode: 6.2, max: 8 },
  }),
  v({
    id: 'litersPerKgCheese', path: 'channels.litersPerKgCheese', group: 'leche', kind: 'number',
    label: 'Litros por kg de queso', unit: 'L/kg', min: 4, max: 14, step: 0.1, tier: 'avanzada',
    synonyms: ['rendimiento', 'queso'],
  }),
  v({
    id: 'cheeseProcessCost', path: 'channels.cheeseProcessCostPerKg', group: 'leche', kind: 'money',
    label: 'Costo de procesar queso', unit: 'USD/kg', min: 0, max: 6, step: 0.05, tier: 'avanzada',
    synonyms: ['queso', 'costo', 'cuajo'],
  }),
  v({
    id: 'lactationMonths', path: 'milk.lactationMonths', group: 'leche', kind: 'integer',
    label: 'Lactancia máxima', unit: 'meses', min: 5, max: 20, step: 1, tier: 'destacada',
    synonyms: ['lactancia', 'días', 'ordeño'],
    help: 'Tope, no duración fija: la vaca se seca antes si la gestación lo exige. La lactancia real emerge de la reproducción.',
  }),
  v({
    id: 'targetDryMonths', path: 'milk.targetDryMonths', group: 'leche', kind: 'integer',
    label: 'Período seco objetivo', unit: 'meses', min: 1, max: 6, step: 1, tier: 'destacada',
    synonyms: ['secado', 'seca', 'descanso'],
  }),
  v({
    id: 'calfMilk', path: 'milk.calfMilkLitersPerDay', group: 'leche', kind: 'number',
    label: 'Leche al becerro', unit: 'L/día', min: 0, max: 10, step: 0.25, tier: 'destacada',
    synonyms: ['becerro', 'amamantamiento', 'cría', 'doble propósito'],
    help: 'Becerro al pie. Es el supuesto más sensible del modelo doble propósito: mueve el ingreso por vaca entre 15% y 25%.',
    mc: { dist: 'triangular', min: 2, mode: 3, max: 4.5 },
  }),
  v({
    id: 'weaningAge', path: 'milk.weaningAgeMonths', group: 'leche', kind: 'integer',
    label: 'Edad al destete', unit: 'meses', min: 2, max: 12, step: 1, tier: 'destacada',
    synonyms: ['destete', 'becerro'],
  }),
  v({
    id: 'shrinkPct', path: 'milk.shrinkPct', group: 'leche', kind: 'percent',
    label: 'Merma de leche', unit: '%', min: 0, max: 0.2, step: 0.005, tier: 'avanzada',
    synonyms: ['merma', 'pérdida', 'derrame'],
  }),
  v({
    id: 'rejectPct', path: 'milk.rejectPct', group: 'leche', kind: 'percent',
    label: 'Rechazo en planta', unit: '%', min: 0, max: 0.2, step: 0.005, tier: 'avanzada',
    synonyms: ['rechazo', 'calidad', 'devolución'],
  }),
  v({
    id: 'qualityBonus', path: 'milk.qualityBonusPct', group: 'leche', kind: 'percent',
    label: 'Bonificación por calidad', unit: '%', min: 0, max: 0.3, step: 0.005, tier: 'avanzada',
    synonyms: ['calidad', 'premio', 'bonificación'],
  }),
  v({
    id: 'priceIndex', path: 'milk.priceIndex', group: 'leche', kind: 'number',
    label: 'Índice de precio de la leche', unit: '×', min: 0.3, max: 2, step: 0.01, tier: 'avanzada',
    synonyms: ['índice', 'shock', 'precio'],
    help: 'Multiplica todos los canales a la vez. Es el mando cómodo para simular "el precio baja 20%".',
  }),

  // --- Mortalidad y sanidad ------------------------------------------------
  v({
    id: 'calfMortality', path: 'health.calfMortalityToWeaning', group: 'sanidad', kind: 'percent',
    label: 'Mortalidad de becerros al destete', unit: '%', min: 0, max: 0.6, step: 0.01, tier: 'destacada',
    synonyms: ['mortalidad', 'becerros', 'muerte', 'cría'],
    help: 'Acumulada hasta el destete, concentrada en los primeros meses. Su efecto sobre las vacas en ordeño tarda casi tres años en aparecer.',
    mc: { dist: 'triangular', min: 0.04, mode: 0.06, max: 0.16 },
  }),
  v({
    id: 'heiferMortality', path: 'health.heiferMortalityAnnual', group: 'sanidad', kind: 'percent',
    label: 'Mortalidad de novillas', unit: '%/año', min: 0, max: 0.3, step: 0.005, tier: 'destacada',
    synonyms: ['mortalidad', 'novillas', 'levante'],
    mc: { dist: 'triangular', min: 0.02, mode: 0.03, max: 0.07 },
  }),
  v({
    id: 'cowMortality', path: 'health.cowMortalityAnnual', group: 'sanidad', kind: 'percent',
    label: 'Mortalidad de vacas', unit: '%/año', min: 0, max: 0.3, step: 0.005, tier: 'destacada',
    synonyms: ['mortalidad', 'vacas', 'muerte'],
    mc: { dist: 'triangular', min: 0.02, mode: 0.035, max: 0.08 },
  }),
  v({
    id: 'mastitisIncidence', path: 'health.mastitisIncidenceAnnual', group: 'sanidad', kind: 'percent',
    label: 'Incidencia de mastitis', unit: '%/año', min: 0, max: 1, step: 0.01, tier: 'destacada',
    synonyms: ['mastitis', 'ubre', 'enfermedad'],
    mc: { dist: 'triangular', min: 0.08, mode: 0.15, max: 0.35 },
  }),
  v({
    id: 'mastitisLoss', path: 'health.mastitisMilkLossPct', group: 'sanidad', kind: 'percent',
    label: 'Leche perdida por mastitis', unit: '%', min: 0, max: 1, step: 0.01, tier: 'avanzada',
    synonyms: ['mastitis', 'pérdida'],
  }),
  v({
    id: 'mastitisCost', path: 'health.mastitisTreatmentCost', group: 'sanidad', kind: 'money',
    label: 'Tratamiento de mastitis', unit: 'USD/caso', min: 0, max: 200, step: 1, tier: 'avanzada',
    synonyms: ['mastitis', 'tratamiento', 'costo'],
  }),
  v({
    id: 'vetCow', path: 'health.vetCostPerCowYear', group: 'sanidad', kind: 'money',
    label: 'Veterinario por vaca', unit: 'USD/año', min: 0, max: 400, step: 5, tier: 'destacada',
    synonyms: ['veterinario', 'sanidad', 'costo', 'vacunas'],
  }),
  v({
    id: 'vetYoung', path: 'health.vetCostPerYoungYear', group: 'sanidad', kind: 'money',
    label: 'Veterinario por animal joven', unit: 'USD/año', min: 0, max: 300, step: 5, tier: 'avanzada',
    synonyms: ['veterinario', 'levante', 'costo'],
  }),

  // --- Reproducción --------------------------------------------------------
  v({
    id: 'conceptionRate', path: 'repro.monthlyConceptionRate', group: 'reproduccion', kind: 'percent',
    label: 'Tasa de concepción mensual', unit: '%', min: 0.02, max: 0.8, step: 0.01, tier: 'destacada',
    synonyms: ['preñez', 'fertilidad', 'concepción', 'servicio'],
    help: 'Probabilidad de que una hembra apta quede preñada en un mes. Es lo que fija el intervalo entre partos.',
    mc: { dist: 'triangular', min: 0.14, mode: 0.22, max: 0.3 },
  }),
  v({
    id: 'ageFirstService', path: 'repro.ageFirstServiceMonths', group: 'reproduccion', kind: 'integer',
    label: 'Edad al primer servicio', unit: 'meses', min: 10, max: 40, step: 1, tier: 'destacada',
    synonyms: ['novillas', 'servicio', 'monta', 'edad'],
  }),
  v({
    id: 'voluntaryWait', path: 'repro.voluntaryWaitMonths', group: 'reproduccion', kind: 'integer',
    label: 'Espera voluntaria tras el parto', unit: 'meses', min: 0, max: 8, step: 1, tier: 'destacada',
    synonyms: ['espera', 'posparto', 'servicio'],
  }),
  v({
    id: 'abortionRate', path: 'repro.abortionRatePerPregnancy', group: 'reproduccion', kind: 'percent',
    label: 'Abortos por gestación', unit: '%', min: 0, max: 0.4, step: 0.005, tier: 'destacada',
    synonyms: ['aborto', 'pérdida', 'gestación'],
    mc: { dist: 'triangular', min: 0.02, mode: 0.04, max: 0.1 },
  }),
  v({
    id: 'stillbirthRate', path: 'repro.stillbirthRate', group: 'reproduccion', kind: 'percent',
    label: 'Mortinatos', unit: '%', min: 0, max: 0.3, step: 0.005, tier: 'avanzada',
    synonyms: ['mortinato', 'parto', 'muerte'],
  }),
  v({
    id: 'femaleBirthRatio', path: 'repro.femaleBirthRatio', group: 'reproduccion', kind: 'percent',
    label: 'Proporción de hembras al nacer', unit: '%', min: 0.3, max: 0.7, step: 0.005, tier: 'avanzada',
    synonyms: ['sexaje', 'hembras', 'nacimientos'],
  }),
  v({
    id: 'cowsPerBull', path: 'repro.cowsPerBull', group: 'reproduccion', kind: 'integer',
    label: 'Vacas por toro', unit: 'vacas', min: 5, max: 60, step: 1, tier: 'avanzada',
    synonyms: ['toro', 'monta', 'carga'],
  }),
  v({
    id: 'maxOpenDry', path: 'repro.maxOpenDryMonths', group: 'reproduccion', kind: 'integer',
    label: 'Meses secas y vacías antes de descartar', unit: 'meses', min: 1, max: 6, step: 1, tier: 'avanzada',
    synonyms: ['horra', 'vacía', 'descarte', 'infertilidad'],
  }),
  v({
    id: 'aiShare', path: 'repro.aiSharePct', group: 'reproduccion', kind: 'percent',
    label: 'Inseminación artificial', unit: '%', min: 0, max: 1, step: 0.05, tier: 'avanzada',
    synonyms: ['inseminación', 'IA', 'pajuelas'],
  }),
  v({
    id: 'aiCost', path: 'repro.aiCostPerService', group: 'reproduccion', kind: 'money',
    label: 'Costo por servicio de IA', unit: 'USD', min: 0, max: 100, step: 1, tier: 'avanzada',
    synonyms: ['inseminación', 'costo', 'pajuela'],
  }),

  // --- Alimentación y pasturas ---------------------------------------------
  v({
    id: 'hectares', path: 'feed.hectares', group: 'alimentacion', kind: 'number',
    label: 'Hectáreas de pastoreo', unit: 'ha', min: 1, max: 1000, step: 1, tier: 'destacada',
    synonyms: ['tierra', 'potrero', 'superficie', 'pasto'],
  }),
  v({
    id: 'dmPerHaMonth', path: 'feed.dmPerHaMonth', group: 'alimentacion', kind: 'number',
    label: 'Materia seca por hectárea', unit: 'kg/ha/mes', min: 100, max: 3000, step: 10, tier: 'destacada',
    synonyms: ['pasto', 'forraje', 'producción', 'sequía', 'materia seca'],
    help: 'Producción de la pastura en un mes promedio. La estacionalidad la reparte a lo largo del año.',
    mc: { dist: 'triangular', min: 520, mode: 780, max: 950 },
  }),
  v({
    id: 'utilizationPct', path: 'feed.utilizationPct', group: 'alimentacion', kind: 'percent',
    label: 'Aprovechamiento de la pastura', unit: '%', min: 0.2, max: 0.9, step: 0.01, tier: 'destacada',
    synonyms: ['aprovechamiento', 'utilización', 'pisoteo', 'manejo'],
    help: 'Fracción del pasto producido que el animal realmente consume. El resto se pisotea o se pasa.',
    mc: { dist: 'triangular', min: 0.42, mode: 0.52, max: 0.65 },
  }),
  v({
    id: 'concentrateKgPerLiter', path: 'feed.concentrateKgPerLiter', group: 'alimentacion', kind: 'number',
    label: 'Concentrado por litro', unit: 'kg/L', min: 0, max: 0.6, step: 0.01, tier: 'destacada',
    synonyms: ['concentrado', 'alimento', 'suplemento'],
  }),
  v({
    id: 'concentrateCost', path: 'feed.concentrateCostPerKg', group: 'alimentacion', kind: 'money',
    label: 'Precio del concentrado', unit: 'USD/kg', min: 0.05, max: 3, step: 0.01, tier: 'destacada',
    synonyms: ['concentrado', 'precio', 'alimento', 'insumo'],
    mc: { dist: 'triangular', min: 0.4, mode: 0.52, max: 0.85 },
  }),
  v({
    id: 'purchasedForageCost', path: 'feed.purchasedForageCostPerKgDm', group: 'alimentacion', kind: 'money',
    label: 'Precio del forraje comprado', unit: 'USD/kg MS', min: 0.02, max: 1.5, step: 0.01, tier: 'destacada',
    synonyms: ['forraje', 'heno', 'silo', 'compra', 'sequía'],
    help: 'Lo que cuesta tapar el déficit de la sequía. Combinado con una sequía es la peor pareja de shocks del modelo.',
    mc: { dist: 'triangular', min: 0.12, mode: 0.18, max: 0.45 },
  }),
  v({
    id: 'buyForageOnDeficit', path: 'feed.buyForageOnDeficit', group: 'alimentacion', kind: 'boolean',
    label: 'Comprar forraje si falta', min: 0, max: 1, step: 1, tier: 'destacada',
    synonyms: ['forraje', 'compra', 'déficit'],
    help: 'Si se desactiva, el déficit lo paga el animal: baja la producción y la condición corporal.',
  }),
  v({
    id: 'fertilizerCost', path: 'feed.fertilizerCostPerHaYear', group: 'alimentacion', kind: 'money',
    label: 'Fertilización', unit: 'USD/ha/año', min: 0, max: 600, step: 5, tier: 'avanzada',
    synonyms: ['fertilizante', 'abono', 'urea'],
  }),
  v({
    id: 'reserveCapacity', path: 'feed.reserveCapacityKg', group: 'alimentacion', kind: 'integer',
    label: 'Capacidad de reservas', unit: 'kg MS', min: 0, max: 1000000, step: 5000, tier: 'avanzada',
    synonyms: ['silo', 'heno', 'reserva', 'almacenamiento'],
  }),
  v({
    id: 'conservationCapture', path: 'feed.conservationCapturePct', group: 'alimentacion', kind: 'percent',
    label: 'Excedente que se conserva', unit: '%', min: 0, max: 1, step: 0.05, tier: 'avanzada',
    synonyms: ['silo', 'henificación', 'conservación'],
  }),
  v({
    id: 'reserveLoss', path: 'feed.reserveLossPct', group: 'alimentacion', kind: 'percent',
    label: 'Pérdida anual de reservas', unit: '%/año', min: 0, max: 0.5, step: 0.01, tier: 'avanzada',
    synonyms: ['silo', 'pérdida', 'deterioro'],
  }),
  v({
    id: 'rentedHectares', path: 'feed.rentedHectares', group: 'alimentacion', kind: 'number',
    label: 'Hectáreas alquiladas', unit: 'ha', min: 0, max: 500, step: 1, tier: 'avanzada',
    synonyms: ['alquiler', 'arriendo', 'tierra'],
  }),
  v({
    id: 'rentedCost', path: 'feed.rentedHaCostPerYear', group: 'alimentacion', kind: 'money',
    label: 'Alquiler por hectárea', unit: 'USD/ha/año', min: 0, max: 800, step: 5, tier: 'avanzada',
    synonyms: ['alquiler', 'arriendo', 'costo'],
  }),

  // --- Personal y operación ------------------------------------------------
  v({
    id: 'employees', path: 'costs.employees', group: 'personal', kind: 'integer',
    label: 'Empleados', unit: 'personas', min: 0, max: 50, step: 1, tier: 'destacada',
    synonyms: ['personal', 'obreros', 'nómina', 'trabajadores'],
  }),
  v({
    id: 'salaryMonthly', path: 'costs.salaryMonthly', group: 'personal', kind: 'money',
    label: 'Salario mensual', unit: 'USD/mes', min: 0, max: 2000, step: 10, tier: 'destacada',
    synonyms: ['salario', 'sueldo', 'nómina', 'pago'],
    mc: { dist: 'triangular', min: 180, mode: 220, max: 340 },
  }),
  v({
    id: 'maintenanceMonthly', path: 'costs.maintenanceMonthly', group: 'personal', kind: 'money',
    label: 'Mantenimiento', unit: 'USD/mes', min: 0, max: 5000, step: 25, tier: 'destacada',
    synonyms: ['mantenimiento', 'reparación', 'cercas'],
  }),
  v({
    id: 'overheadMonthly', path: 'costs.overheadMonthly', group: 'personal', kind: 'money',
    label: 'Gastos generales', unit: 'USD/mes', min: 0, max: 5000, step: 25, tier: 'destacada',
    synonyms: ['administración', 'gastos', 'overhead'],
  }),
  v({
    id: 'transportPerLiter', path: 'costs.transportPerLiter', group: 'personal', kind: 'money',
    label: 'Transporte de leche', unit: 'USD/L', min: 0, max: 0.3, step: 0.005, tier: 'avanzada',
    synonyms: ['transporte', 'flete', 'logística'],
  }),
  v({
    id: 'coolingPerLiter', path: 'costs.coolingPerLiter', group: 'personal', kind: 'money',
    label: 'Refrigeración', unit: 'USD/L', min: 0, max: 0.3, step: 0.005, tier: 'avanzada',
    synonyms: ['frío', 'tanque', 'enfriamiento'],
  }),
  v({
    id: 'lossPct', path: 'costs.lossPct', group: 'personal', kind: 'percent',
    label: 'Robo y pérdidas', unit: '% ingresos', min: 0, max: 0.3, step: 0.005, tier: 'destacada',
    synonyms: ['robo', 'merma', 'pérdida', 'hurto'],
  }),

  // --- Infraestructura -----------------------------------------------------
  v({
    id: 'initialCash', path: 'capital.initialCash', group: 'infraestructura', kind: 'money',
    label: 'Caja inicial', unit: 'USD', min: 0, max: 1000000, step: 1000, tier: 'destacada',
    synonyms: ['caja', 'efectivo', 'liquidez', 'capital'],
  }),
  v({
    id: 'minCashBuffer', path: 'capital.minCashBuffer', group: 'infraestructura', kind: 'money',
    label: 'Caja mínima deseada', unit: 'USD', min: 0, max: 200000, step: 500, tier: 'destacada',
    synonyms: ['colchón', 'reserva', 'caja mínima'],
    help: 'Por debajo de este saldo la finca vende ganado o pide un aporte, según las políticas.',
  }),
  v({
    id: 'fixedAssetsValue', path: 'capital.fixedAssetsValue', group: 'infraestructura', kind: 'money',
    label: 'Activos fijos', unit: 'USD', min: 0, max: 2000000, step: 1000, tier: 'destacada',
    synonyms: ['instalaciones', 'sala de ordeño', 'maquinaria', 'equipos'],
  }),
  v({
    id: 'fixedAssetsLife', path: 'capital.fixedAssetsLifeYears', group: 'infraestructura', kind: 'integer',
    label: 'Vida útil de los activos', unit: 'años', min: 1, max: 40, step: 1, tier: 'avanzada',
    synonyms: ['depreciación', 'vida útil'],
  }),
  v({
    id: 'fixedAssetsSalvage', path: 'capital.fixedAssetsSalvagePct', group: 'infraestructura', kind: 'percent',
    label: 'Valor residual', unit: '%', min: 0, max: 0.8, step: 0.01, tier: 'avanzada',
    synonyms: ['residual', 'salvamento', 'depreciación'],
  }),
  v({
    id: 'landHectares', path: 'capital.landHectares', group: 'infraestructura', kind: 'number',
    label: 'Hectáreas propias', unit: 'ha', min: 0, max: 2000, step: 1, tier: 'destacada',
    synonyms: ['tierra', 'finca', 'propiedad'],
  }),
  v({
    id: 'debtPrincipal', path: 'capital.debtPrincipal', group: 'infraestructura', kind: 'money',
    label: 'Deuda inicial', unit: 'USD', min: 0, max: 1000000, step: 1000, tier: 'destacada',
    synonyms: ['préstamo', 'deuda', 'crédito', 'banco'],
  }),
  v({
    id: 'debtTermMonths', path: 'capital.debtTermMonths', group: 'infraestructura', kind: 'integer',
    label: 'Plazo del préstamo', unit: 'meses', min: 0, max: 360, step: 6, tier: 'avanzada',
    synonyms: ['plazo', 'préstamo', 'crédito'],
  }),

  // --- Variables macroeconómicas -------------------------------------------
  v({
    id: 'costInflation', path: 'macro.costInflationAnnual', group: 'macro', kind: 'percent',
    label: 'Inflación de costos', unit: '%/año', min: -0.1, max: 1, step: 0.005, tier: 'destacada',
    synonyms: ['inflación', 'costos', 'devaluación'],
    mc: { dist: 'triangular', min: 0.01, mode: 0.03, max: 0.15 },
  }),
  v({
    id: 'cattlePriceIndex', path: 'macro.cattlePriceIndex', group: 'macro', kind: 'number',
    label: 'Índice de precio del ganado', unit: '×', min: 0.3, max: 2.5, step: 0.01, tier: 'destacada',
    synonyms: ['ganado', 'precio', 'carne', 'índice'],
    mc: { dist: 'triangular', min: 0.75, mode: 1, max: 1.25 },
  }),
  v({
    id: 'fuelIndex', path: 'macro.fuelIndex', group: 'macro', kind: 'number',
    label: 'Índice de combustible', unit: '×', min: 0.3, max: 4, step: 0.05, tier: 'avanzada',
    synonyms: ['combustible', 'gasoil', 'diésel', 'transporte'],
  }),
  v({
    id: 'cullCowPrice', path: 'prices.cullCowPricePerKg', group: 'macro', kind: 'money',
    label: 'Precio de vaca de descarte', unit: 'USD/kg', min: 0.3, max: 8, step: 0.05, tier: 'destacada',
    synonyms: ['descarte', 'carne', 'precio', 'gorda'],
  }),
  v({
    id: 'maleSalePrice', path: 'prices.maleSalePricePerKg', group: 'macro', kind: 'money',
    label: 'Precio de macho en pie', unit: 'USD/kg', min: 0.3, max: 8, step: 0.05, tier: 'destacada',
    synonyms: ['machos', 'becerros', 'precio', 'carne'],
    mc: { dist: 'triangular', min: 1.8, mode: 2.45, max: 3.1 },
  }),
  v({
    id: 'heiferPrice', path: 'prices.heiferPricePerHead', group: 'macro', kind: 'money',
    label: 'Precio de novilla', unit: 'USD/cabeza', min: 100, max: 4000, step: 25, tier: 'destacada',
    synonyms: ['novilla', 'precio', 'venta', 'reemplazo'],
  }),
  v({
    id: 'bullPrice', path: 'prices.bullPricePerHead', group: 'macro', kind: 'money',
    label: 'Precio de toro', unit: 'USD/cabeza', min: 200, max: 10000, step: 50, tier: 'avanzada',
    synonyms: ['toro', 'padrote', 'precio'],
  }),
  v({
    id: 'landPricePerHa', path: 'capital.landPricePerHa', group: 'macro', kind: 'money',
    label: 'Precio de la tierra', unit: 'USD/ha', min: 100, max: 30000, step: 100, tier: 'destacada',
    synonyms: ['tierra', 'hectárea', 'precio', 'terreno'],
  }),
  v({
    id: 'liquidationHaircut', path: 'prices.liquidationHaircutPct', group: 'macro', kind: 'percent',
    label: 'Castigo por venta forzada', unit: '%', min: 0, max: 0.6, step: 0.01, tier: 'destacada',
    synonyms: ['liquidación', 'remate', 'castigo', 'haircut'],
    help: 'Descuento sobre el valor de mercado si hay que liquidar todo de golpe. Es la brecha entre patrimonio contable y realizable.',
  }),
  v({
    id: 'debtAnnualRate', path: 'capital.debtAnnualRate', group: 'macro', kind: 'percent',
    label: 'Tasa del préstamo', unit: '%/año', min: 0, max: 1, step: 0.005, tier: 'destacada',
    synonyms: ['interés', 'tasa', 'crédito', 'banco'],
  }),
  v({
    id: 'discountRate', path: 'capital.discountRateAnnual', group: 'macro', kind: 'percent',
    label: 'Tasa de descuento', unit: '%/año', min: 0, max: 0.6, step: 0.005, tier: 'destacada',
    synonyms: ['descuento', 'VAN', 'oportunidad', 'rendimiento'],
    help: 'Rendimiento alternativo del capital. Es contra esto que se mide el VAN y el costo de oportunidad.',
  }),
  v({
    id: 'taxRate', path: 'capital.taxRate', group: 'macro', kind: 'percent',
    label: 'Impuesto sobre la renta', unit: '%', min: 0, max: 0.6, step: 0.01, tier: 'avanzada',
    synonyms: ['impuesto', 'ISLR', 'tributo'],
  }),
  v({
    id: 'bookValueCow', path: 'prices.bookValueCowPerHead', group: 'macro', kind: 'money',
    label: 'Valor contable de una vaca', unit: 'USD', min: 50, max: 3000, step: 25, tier: 'avanzada',
    synonyms: ['contable', 'libro', 'costo de crianza'],
  }),
  v({
    id: 'bookValueHeifer', path: 'prices.bookValueHeiferPerHead', group: 'macro', kind: 'money',
    label: 'Valor contable de una novilla', unit: 'USD', min: 50, max: 3000, step: 25, tier: 'avanzada',
    synonyms: ['contable', 'libro', 'costo de crianza'],
  }),
];

export const VARIABLES_BY_ID: ReadonlyMap<string, VariableSpec> = new Map(
  VARIABLES.map((s) => [s.id, s]),
);

export const VARIABLES_BY_PATH: ReadonlyMap<ParamPath, VariableSpec> = new Map(
  VARIABLES.map((s) => [s.path, s]),
);

export const VARIABLES_BY_GROUP: ReadonlyMap<GroupId, VariableSpec[]> = new Map(
  GROUPS.map((g) => [g.id, VARIABLES.filter((s) => s.group === g.id)]),
);

/** Variables con rango declarado para Monte Carlo y para el barrido de sensibilidad. */
export const MC_VARIABLES: VariableSpec[] = VARIABLES.filter((s) => s.mc);

export function readValue(a: Assumptions, spec: VariableSpec): number {
  const raw = getByPath(a, spec.path);
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  return typeof raw === 'number' ? raw : 0;
}

export const baseValue = (spec: VariableSpec): number => readValue(DEFAULT_ASSUMPTIONS, spec);

/** Búsqueda por etiqueta y sinónimos, insensible a acentos y mayúsculas. */
const fold = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function searchVariables(query: string, pool: VariableSpec[] = VARIABLES): VariableSpec[] {
  const q = fold(query.trim());
  if (!q) return pool;
  return pool.filter((s) => {
    if (fold(s.label).includes(q)) return true;
    if (s.synonyms?.some((w) => fold(w).includes(q))) return true;
    return fold(s.path).includes(q);
  });
}
