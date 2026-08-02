'use client';

import type { SimulationSummary } from '@/engine/types';
import { moneyCompact, pct, signedPct } from '@/lib/format';

interface Kpi {
  label: string;
  value: string;
  hint?: string;
  /** Signo de la variación respecto a la finca base, ya orientado a "mejor/peor". */
  delta?: { text: string; good: boolean } | null;
}

const relative = (now: number, before: number, higherIsBetter: boolean) => {
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null;
  const change = now / before - 1;
  if (Math.abs(change) < 0.005) return null;
  return { text: signedPct(change), good: higherIsBetter === change > 0 };
};

export function KpiStrip({ summary, base }: { summary: SimulationSummary; base: SimulationSummary }) {
  const bought = summary.acquisitionCost > 0;
  const kpis: Kpi[] = [
    {
      label: 'Inversión inicial',
      value: moneyCompact(summary.initialInvestment),
      hint: bought
        ? `Pagaste ${moneyCompact(summary.acquisitionCost)} por activos que valen ${moneyCompact(
            summary.acquisitionCost + summary.entryGain,
          )}`
        : 'La finca ya es tuya: lo que arriesgas es su valor de liquidación',
      delta: relative(summary.initialInvestment, base.initialInvestment, false),
    },
    {
      label: 'Patrimonio a 10 años',
      value: moneyCompact(summary.finalBookEquity),
      hint: 'Contable: hato a costo + activos + caja − deuda',
      delta: relative(summary.finalBookEquity, base.finalBookEquity, true),
    },
    {
      label: 'Caja mínima',
      value: moneyCompact(summary.worstCashBalance),
      hint: `En el mes ${summary.worstCashMonth + 1}`,
      delta: relative(summary.worstCashBalance, base.worstCashBalance, true),
    },
    {
      label: 'Capital requerido',
      value: moneyCompact(summary.maxCapitalRequired),
      hint: `Aporte extra para no quedar sin liquidez. Con la inversión inicial: ${moneyCompact(
        summary.totalCapitalRequired,
      )}`,
      delta: relative(summary.maxCapitalRequired, base.maxCapitalRequired, false),
    },
    {
      label: 'TIR anual',
      value: summary.irrAnnual === null ? '—' : pct(summary.irrAnnual, 1),
      hint: bought
        ? 'Sobre el desembolso de compra y los aportes posteriores'
        : 'Sobre el valor de liquidación inicial y los aportes posteriores',
    },
    {
      label: 'Mes de quiebre',
      value: summary.firstInsolventMonth === null ? 'ninguno' : `mes ${summary.firstInsolventMonth + 1}`,
      hint: `${summary.monthsInsolvent} meses insolventes`,
    },
    {
      label: 'Costo por litro',
      value: `$${summary.avgCostPerLiter.toFixed(3)}`,
      hint: `Margen $${summary.avgMarginPerLiter.toFixed(3)}/L`,
      delta: relative(summary.avgCostPerLiter, base.avgCostPerLiter, false),
    },
    {
      label: 'Hato final',
      value: `${Math.round(summary.finalHerd)}`,
      hint: `${Math.round(summary.finalCowsMilking)} vacas en ordeño`,
      delta: relative(summary.finalHerd, base.finalHerd, true),
    },
  ];

  return (
    // En móvil son ocho tarjetas: apiladas comerían media pantalla, así que se deslizan.
    <div className="flex snap-x snap-mandatory gap-px overflow-x-auto bg-zinc-200 sm:grid sm:grid-cols-4 sm:overflow-x-visible lg:grid-cols-8">
      {kpis.map((k) => (
        <div
          key={k.label}
          className="w-36 shrink-0 snap-start bg-white px-3 py-2 sm:w-auto sm:shrink"
          title={k.hint}
        >
          <div className="truncate text-[11px] text-zinc-500">{k.label}</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-semibold tabular-nums text-zinc-900">{k.value}</span>
            {k.delta ? (
              <span className={`text-[11px] font-medium ${k.delta.good ? 'text-emerald-600' : 'text-red-600'}`}>
                {k.delta.text}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
