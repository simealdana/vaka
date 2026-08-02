'use client';

import { useState } from 'react';
import { overrideWeight } from '@/engine/scenario/resolve';
import type { ScenarioOverride } from '@/engine/types';
import { EVENT_PRESETS, instantiate } from '@/lib/assumptions/presets/stress';
import { useAssumptionsStore } from '@/lib/state/useAssumptionsStore';
import { EventCard } from './EventCard';

const MONTHS = 120;
const BARS = 60; // dos meses por barra: cabe en el panel sin volverse ilegible

const BLANK = (): ScenarioOverride => ({
  id: crypto.randomUUID(),
  label: 'Evento nuevo',
  target: 'milk.priceIndex',
  op: 'pctDelta',
  value: -0.2,
  startMonth: 12,
  durationMonths: 6,
  recovery: { type: 'linear', months: 3 },
});

/** Franja de intensidad del evento a lo largo de los diez años, para ver cuándo pega. */
function Strip({ override }: { override: ScenarioOverride }) {
  const weights = Array.from({ length: BARS }, (_, i) => {
    const a = overrideWeight(override, i * 2);
    const b = overrideWeight(override, i * 2 + 1);
    return Math.max(a, b);
  });
  const peak = Math.max(...weights, 1e-9);
  return (
    <div className="flex h-2 gap-px" aria-hidden>
      {weights.map((w, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px] bg-emerald-500"
          style={{ opacity: w <= 0 ? 0.08 : 0.25 + 0.75 * (w / peak) }}
        />
      ))}
    </div>
  );
}

export function TimelineEditor() {
  const overrides = useAssumptionsStore((s) => s.overrides);
  const addOverride = useAssumptionsStore((s) => s.addOverride);
  const [picker, setPicker] = useState(false);

  const addPreset = (id: string) => {
    const preset = EVENT_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    for (const draft of preset.overrides) addOverride(instantiate(draft));
    setPicker(false);
  };

  const sorted = [...overrides].sort((a, b) => a.startMonth - b.startMonth);

  return (
    <section className="border-b border-zinc-100">
      <div className="flex items-center gap-2 px-3 py-2">
        <h3 className="flex-1 text-[13px] font-medium text-zinc-800">Eventos temporales</h3>
        {overrides.length > 0 ? (
          <span className="rounded bg-emerald-100 px-1.5 text-[11px] text-emerald-800">
            {overrides.length}
          </span>
        ) : null}
      </div>

      <div className="space-y-2 px-3 pb-3">
        {overrides.length === 0 ? (
          <p className="text-[11px] leading-snug text-zinc-400">
            Nada pasa fuera de lo normal en estos diez años. Añade una sequía, una caída de precio o
            una mejora para ver cómo reacciona la finca.
          </p>
        ) : null}

        {sorted.map((o) => (
          <div key={o.id} className="space-y-1">
            <EventCard override={o} />
            <Strip override={o} />
          </div>
        ))}

        {overrides.length > 0 ? (
          <div className="flex justify-between text-[10px] text-zinc-400">
            <span>Año 1</span>
            <span>Año {MONTHS / 12}</span>
          </div>
        ) : null}

        {picker ? (
          <div className="space-y-1 rounded border border-zinc-200 bg-zinc-50 p-2">
            {EVENT_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addPreset(p.id)}
                className="block w-full rounded px-1.5 py-1 text-left hover:bg-white"
              >
                <span className="block text-[12px] font-medium text-zinc-800">
                  {p.tone === 'malo' ? '▼' : '▲'} {p.label}
                </span>
                <span className="block text-[11px] leading-snug text-zinc-500">{p.description}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                addOverride(BLANK());
                setPicker(false);
              }}
              className="block w-full rounded px-1.5 py-1 text-left text-[12px] font-medium text-zinc-600 hover:bg-white"
            >
              ✎ Evento en blanco
            </button>
            <button
              type="button"
              onClick={() => setPicker(false)}
              className="block w-full rounded px-1.5 py-1 text-left text-[11px] text-zinc-400 hover:bg-white"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPicker(true)}
            className="w-full rounded bg-zinc-100 px-2 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-200"
          >
            + Añadir evento
          </button>
        )}
      </div>
    </section>
  );
}
