'use client';

import { useState } from 'react';
import type { SimulationOutput } from '@/engine/types';
import type { Explanation } from '@/lib/explain/narrative';
import { useAssumptionsStore } from '@/lib/state/useAssumptionsStore';

/** Diez filas anuales: suficiente contexto para el modelo sin mandarle los 120 meses. */
function annualSummary(output: SimulationOutput) {
  const rows: {
    year: number;
    ingresos: number;
    costos: number;
    ebitda: number;
    caja: number;
    patrimonio: number;
    litros: number;
    hato: number;
  }[] = [];
  for (let year = 1; year * 12 <= output.months.length; year++) {
    const slice = output.months.slice((year - 1) * 12, year * 12);
    const last = slice[slice.length - 1];
    const sum = (get: (m: (typeof slice)[number]) => number) =>
      Math.round(slice.reduce((s, m) => s + get(m), 0));
    rows.push({
      year,
      ingresos: sum((m) => m.pnl.revenueTotal),
      costos: sum((m) => m.pnl.costTotal),
      ebitda: sum((m) => m.pnl.ebitda),
      caja: Math.round(last.cash.balance),
      patrimonio: Math.round(last.balance.bookEquity),
      litros: sum((m) => m.milk.litersSold),
      hato: Math.round(last.herd.total),
    });
  }
  return rows;
}

export function AiExplainButton({
  explanation,
  output,
}: {
  explanation: Explanation;
  output: SimulationOutput;
}) {
  const name = useAssumptionsStore((s) => s.name);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const run = async () => {
    setState('loading');
    setText('');
    setError('');
    try {
      const response = await fetch('/api/explicar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioName: name,
          draft: explanation.sections.map((s) => ({
            title: s.title,
            items: s.items.map((i) => i.text),
          })),
          loss: explanation.loss as unknown as Record<string, number>,
          annual: annualSummary(output),
        }),
      });
      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => ({ error: 'No se pudo generar la explicación.' }));
        setError(detail.error ?? 'No se pudo generar la explicación.');
        setState('error');
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setText((t) => t + decoder.decode(value, { stream: true }));
      }
      setState('done');
    } catch {
      setError('No se pudo contactar al servidor.');
      setState('error');
    }
  };

  return (
    <div className="space-y-2 border-t border-zinc-100 pt-3">
      <button
        type="button"
        onClick={() => void run()}
        disabled={state === 'loading'}
        className="rounded bg-zinc-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {state === 'loading' ? 'Escribiendo…' : 'Explicar con IA'}
      </button>
      {error ? <p className="text-[12px] text-amber-700">{error}</p> : null}
      {text ? (
        <div className="rounded bg-zinc-50 p-3 text-[13px] leading-relaxed whitespace-pre-wrap text-zinc-700">
          {text}
        </div>
      ) : null}
    </div>
  );
}
