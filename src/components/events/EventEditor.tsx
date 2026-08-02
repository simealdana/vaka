'use client';

import { useState } from 'react';
import type { OverrideOp, ScenarioOverride } from '@/engine/types';
import { EVENT_PRESETS, instantiate } from '@/lib/assumptions/presets/stress';
import { VARIABLES_BY_PATH } from '@/lib/assumptions/schema';
import { decimals, formatValue, monthLabel, signedPct } from '@/lib/format';
import { useAssumptionsStore } from '@/lib/state/useAssumptionsStore';
import { EventForm } from './EventForm';

/** Lo que el motor sabe hacer, dicho como lo diría un productor. */
export const OPS: { id: OverrideOp; label: string }[] = [
  { id: 'pctDelta', label: 'cambia un %' },
  { id: 'set', label: 'queda en' },
  { id: 'add', label: 'suma' },
  { id: 'multiply', label: 'se multiplica por' },
];

export function describeEffect(o: ScenarioOverride): string {
  const spec = VARIABLES_BY_PATH.get(o.target);
  const amount = (n: number) => (spec ? formatValue(n, spec) : decimals(n, 2));
  switch (o.op) {
    case 'pctDelta':
      return signedPct(o.value);
    case 'multiply':
      return `×${decimals(o.value, 2)}`;
    case 'add':
      return `${o.value < 0 ? '−' : '+'}${amount(Math.abs(o.value))}`;
    case 'set':
      return `= ${amount(o.value)}`;
  }
}

export function describeWindow(o: ScenarioOverride): string {
  const start = monthLabel(o.startMonth);
  if (!Number.isFinite(o.durationMonths)) return `desde ${start}, permanente`;
  const end = monthLabel(o.startMonth + o.durationMonths - 1);
  const repeat = o.repeat ? `, se repite cada ${o.repeat.everyMonths} meses` : '';
  return `${start} → ${end}${repeat}`;
}

function EventCard({ event, onEdit }: { event: ScenarioOverride; onEdit: () => void }) {
  const remove = useAssumptionsStore((s) => s.removeOverride);
  const spec = VARIABLES_BY_PATH.get(event.target);

  return (
    <li className="rounded border border-zinc-200 bg-white px-2 py-1.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-zinc-800">{event.label}</p>
          <p className="truncate text-[11px] text-zinc-500">
            {spec?.label ?? event.target} <span className="font-medium text-zinc-700">{describeEffect(event)}</span>
          </p>
          <p className="text-[11px] text-zinc-400">{describeWindow(event)}</p>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Editar ${event.label}`}
            className="rounded px-1.5 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => remove(event.id)}
            aria-label={`Quitar ${event.label}`}
            className="rounded px-1.5 py-1 text-[12px] text-zinc-400 hover:bg-red-50 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      </div>
    </li>
  );
}

export function EventEditor() {
  const overrides = useAssumptionsStore((s) => s.overrides);
  const addOverride = useAssumptionsStore((s) => s.addOverride);
  const [editing, setEditing] = useState<ScenarioOverride | 'new' | null>(null);
  const [showPresets, setShowPresets] = useState(false);

  const applyPreset = (id: string) => {
    const preset = EVENT_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    for (const draft of preset.overrides) addOverride(instantiate(draft));
    setShowPresets(false);
  };

  return (
    <section className="border-b border-zinc-100 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Eventos temporales
        </h3>
        <span className="text-[11px] text-zinc-400">{overrides.length}</span>
      </div>

      <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">
        Cosas que pasan en un mes concreto y duran un tiempo: una sequía, una caída de precio, un
        brote. El resto de supuestos no se mueve.
      </p>

      {overrides.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {overrides.map((o) => (
            <EventCard key={o.id} event={o} onEdit={() => setEditing(o)} />
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex-1 rounded bg-zinc-900 px-2 py-1.5 text-[12px] font-medium text-white hover:bg-zinc-700"
        >
          + Añadir evento
        </button>
        <button
          type="button"
          onClick={() => setShowPresets((p) => !p)}
          className="rounded bg-zinc-100 px-2 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-200"
        >
          Ejemplos
        </button>
      </div>

      {showPresets ? (
        <ul className="mt-2 space-y-1">
          {EVENT_PRESETS.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => applyPreset(p.id)}
                className="block w-full rounded border border-zinc-200 px-2 py-1.5 text-left hover:border-emerald-400 hover:bg-emerald-50"
              >
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-800">
                  <span className={p.tone === 'bueno' ? 'text-emerald-600' : 'text-amber-600'}>
                    {p.tone === 'bueno' ? '▲' : '▼'}
                  </span>
                  {p.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500">
                  {p.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {editing ? (
        <EventForm
          event={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}
