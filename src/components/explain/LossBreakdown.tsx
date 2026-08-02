'use client';

import type { LossBreakdown as Loss } from '@/lib/explain/ledger';
import { money } from '@/lib/format';

interface Row {
  label: string;
  amount: number;
  source: string;
  /** Lo convertido en activos no es una pérdida: se pinta distinto para no confundirlo. */
  neutral?: boolean;
}

export function LossBreakdown({ loss }: { loss: Loss }) {
  const rows: Row[] = [
    { label: 'Pérdida de caja', amount: loss.cash, source: 'Diferencia del punto más bajo del saldo' },
    { label: 'Pérdida contable', amount: loss.accounting, source: 'Utilidad neta acumulada, con depreciación y muertes' },
    { label: 'Reducción de patrimonio', amount: loss.equity, source: 'Activos menos pasivos al mes 120' },
    {
      label: 'Convertido en activos',
      amount: loss.convertedToAssets,
      source: `Inversión ${money(loss.capex)} + inventario de ganado ${money(loss.herdValueChange)}`,
      neutral: true,
    },
    { label: 'Costo de oportunidad', amount: -loss.opportunityCost, source: 'Contra el rendimiento alternativo del capital' },
  ];

  const scale = Math.max(...rows.map((r) => Math.abs(r.amount)), 1);

  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
        Dónde quedó el dinero
      </h3>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="text-zinc-700">{r.label}</span>
              <span
                className={`font-medium tabular-nums ${
                  r.neutral ? 'text-sky-700' : r.amount < 0 ? 'text-red-600' : 'text-emerald-700'
                }`}
              >
                {money(r.amount)}
              </span>
            </div>
            <div className="mt-0.5 h-1.5 w-full rounded bg-zinc-100">
              <div
                className={`h-1.5 rounded ${r.neutral ? 'bg-sky-400' : r.amount < 0 ? 'bg-red-400' : 'bg-emerald-400'}`}
                style={{ width: `${(Math.abs(r.amount) / scale) * 100}%` }}
              />
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-400">{r.source}</p>
          </li>
        ))}
      </ul>
      {loss.convertedToAssets > 1000 ? (
        <p className="rounded bg-sky-50 px-2 py-1.5 text-[12px] text-sky-900">
          Gastaste {money(loss.convertedToAssets)} pero no los perdiste: se convirtieron en el
          equivalente a {Math.round(loss.heifersEquivalent)} novillas y en instalaciones que siguen
          siendo tuyas.
        </p>
      ) : null}
    </div>
  );
}
