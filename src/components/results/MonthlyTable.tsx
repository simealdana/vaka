'use client';

import { useState } from 'react';
import type { MonthlyResult, SimulationOutput } from '@/engine/types';
import { decimals, money } from '@/lib/format';

const COLUMNS: { key: string; label: string; get: (m: MonthlyResult) => string; warn?: (m: MonthlyResult) => boolean }[] = [
  { key: 'mes', label: 'Mes', get: (m) => String(m.month + 1) },
  { key: 'hato', label: 'Hato', get: (m) => decimals(m.herd.total, 0) },
  { key: 'ordeno', label: 'En ordeño', get: (m) => decimals(m.herd.cowsMilking, 0) },
  { key: 'litros', label: 'Litros vendidos', get: (m) => decimals(m.milk.litersSold, 0) },
  { key: 'nbr', label: 'NBR', get: (m) => decimals(m.feed.nbr, 2), warn: (m) => m.feed.nbr < 0.95 },
  { key: 'bcs', label: 'Condición', get: (m) => decimals(m.feed.bcs, 2), warn: (m) => m.feed.bcs < 2.5 },
  { key: 'ingresos', label: 'Ingresos', get: (m) => money(m.pnl.revenueTotal) },
  { key: 'costos', label: 'Costos', get: (m) => money(m.pnl.costTotal) },
  { key: 'ebitda', label: 'EBITDA', get: (m) => money(m.pnl.ebitda), warn: (m) => m.pnl.ebitda < 0 },
  { key: 'caja', label: 'Caja', get: (m) => money(m.cash.balance), warn: (m) => m.cash.balance < 0 },
  { key: 'patrimonio', label: 'Patrimonio', get: (m) => money(m.balance.bookEquity) },
];

export function MonthlyTable({ output }: { output: SimulationOutput }) {
  const [yearly, setYearly] = useState(true);
  const rows = yearly ? output.months.filter((m) => m.month % 12 === 11) : output.months;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-[11px] text-zinc-500">{rows.length} filas</span>
        <button
          type="button"
          onClick={() => setYearly((y) => !y)}
          className="rounded bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-200"
        >
          {yearly ? 'Ver todos los meses' : 'Ver cierre anual'}
        </button>
      </div>
      <div className="max-h-96 overflow-auto rounded border border-zinc-200">
        <table className="w-full border-collapse text-[12px] tabular-nums">
          <thead className="sticky top-0 z-10 bg-zinc-50 text-zinc-500">
            <tr>
              {COLUMNS.map((c, i) => (
                <th
                  key={c.key}
                  className={`border-b border-zinc-200 px-2 py-1.5 text-right font-medium whitespace-nowrap ${
                    i === 0 ? 'sticky left-0 z-20 bg-zinc-50' : ''
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.month} className="group hover:bg-emerald-50/50">
                {COLUMNS.map((c, i) => (
                  <td
                    key={c.key}
                    className={`border-b border-zinc-100 px-2 py-1 text-right whitespace-nowrap ${
                      c.warn?.(m) ? 'text-red-600' : 'text-zinc-700'
                    } ${i === 0 ? 'sticky left-0 z-10 bg-white group-hover:bg-emerald-50' : ''}`}
                  >
                    {c.get(m)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
