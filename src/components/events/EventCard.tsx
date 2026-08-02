'use client';

import { useMemo, useState } from 'react';
import type { OverrideOp, ScenarioOverride } from '@/engine/types';
import { VARIABLES, VARIABLES_BY_PATH } from '@/lib/assumptions/schema';
import { formatValue } from '@/lib/format';
import { useAssumptionsStore } from '@/lib/state/useAssumptionsStore';

const OPS: { id: OverrideOp; label: string; hint: string }[] = [
  { id: 'pctDelta', label: '± %', hint: 'Sube o baja un porcentaje sobre el valor del supuesto' },
  { id: 'multiply', label: '×', hint: 'Multiplica el valor del supuesto' },
  { id: 'set', label: '=', hint: 'Fija el valor mientras dura el evento' },
  { id: 'add', label: '+', hint: 'Suma una cantidad al valor del supuesto' },
];

const RECOVERIES: { id: 'none' | 'immediate' | 'linear' | 'exponential'; label: string }[] = [
  { id: 'immediate', label: 'De golpe' },
  { id: 'linear', label: 'Poco a poco' },
  { id: 'exponential', label: 'Rápido y luego lento' },
];

const PERMANENT = Number.POSITIVE_INFINITY;

/** Cómo se lee el efecto en la cabecera de la tarjeta, sin jerga de operadores. */
export function describeEffect(o: ScenarioOverride): string {
  const spec = VARIABLES_BY_PATH.get(o.target);
  const name = spec?.label ?? o.target;
  switch (o.op) {
    case 'pctDelta':
      return `${name} ${o.value >= 0 ? '+' : '−'}${Math.abs(o.value * 100).toFixed(0)}%`;
    case 'multiply':
      return `${name} ×${o.value}`;
    case 'add':
      return `${name} ${o.value >= 0 ? '+' : '−'}${Math.abs(o.value)}`;
    default:
      return `${name} = ${spec ? formatValue(o.value, spec) : o.value}`;
  }
}

export function describeWindow(o: ScenarioOverride): string {
  const start = `mes ${o.startMonth + 1}`;
  if (!Number.isFinite(o.durationMonths)) return `desde el ${start}, permanente`;
  const repeat = o.repeat ? `, se repite cada ${o.repeat.everyMonths} meses` : '';
  return `${start} a ${o.startMonth + o.durationMonths}, ${o.durationMonths} meses${repeat}`;
}

/** El valor que se teclea: los porcentajes se editan en 0-100, el resto en unidades. */
const displayValue = (o: ScenarioOverride): number =>
  o.op === 'pctDelta' ? Math.round(o.value * 1000) / 10 : o.value;

export function EventCard({ override: o }: { override: ScenarioOverride }) {
  const update = useAssumptionsStore((s) => s.updateOverride);
  const remove = useAssumptionsStore((s) => s.removeOverride);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const spec = VARIABLES_BY_PATH.get(o.target);
  const permanent = !Number.isFinite(o.durationMonths);
  const recovery = o.recovery?.type ?? 'immediate';

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = VARIABLES.filter((s) => s.kind !== 'boolean');
    if (!q) return pool;
    return pool.filter(
      (s) => s.label.toLowerCase().includes(q) || s.synonyms?.some((w) => w.toLowerCase().includes(q)),
    );
  }, [query]);

  return (
    <div className="rounded border border-zinc-200 bg-white">
      <div className="flex items-start gap-1.5 p-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-[12px] font-medium text-zinc-800">
            {o.label || describeEffect(o)}
          </span>
          <span className="block text-[11px] text-zinc-500">{describeEffect(o)}</span>
          <span className="block text-[11px] text-zinc-400">{describeWindow(o)}</span>
        </button>
        <button
          type="button"
          onClick={() => remove(o.id)}
          aria-label={`Quitar evento ${o.label}`}
          className="rounded px-1.5 py-0.5 text-[13px] leading-none text-zinc-400 hover:bg-red-50 hover:text-red-600"
        >
          ✕
        </button>
      </div>

      {open ? (
        <div className="space-y-2 border-t border-zinc-100 p-2 text-[11px]">
          <label className="block">
            <span className="text-zinc-500">Nombre</span>
            <input
              type="text"
              value={o.label}
              onChange={(e) => update(o.id, { label: e.target.value })}
              className="mt-0.5 w-full rounded border border-zinc-200 px-1.5 py-1 text-[12px] outline-none focus:border-emerald-500"
            />
          </label>

          <div>
            <span className="text-zinc-500">Qué afecta</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar variables…"
              className="mt-0.5 w-full rounded border border-zinc-200 px-1.5 py-1 text-[12px] outline-none focus:border-emerald-500"
            />
            <select
              value={o.target}
              onChange={(e) => update(o.id, { target: e.target.value })}
              aria-label="Variable afectada"
              className="mt-1 w-full rounded border border-zinc-200 bg-white px-1.5 py-1 text-[12px] outline-none focus:border-emerald-500"
            >
              {options.some((s) => s.path === o.target) ? null : (
                <option value={o.target}>{spec?.label ?? o.target}</option>
              )}
              {options.map((s) => (
                <option key={s.path} value={s.path}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-1.5">
            <label className="flex-1">
              <span className="text-zinc-500">Cómo</span>
              <select
                value={o.op}
                onChange={(e) => update(o.id, { op: e.target.value as OverrideOp })}
                className="mt-0.5 w-full rounded border border-zinc-200 bg-white px-1.5 py-1 text-[12px] outline-none focus:border-emerald-500"
              >
                {OPS.map((op) => (
                  <option key={op.id} value={op.id} title={op.hint}>
                    {op.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1">
              <span className="text-zinc-500">Cuánto{o.op === 'pctDelta' ? ' (%)' : ''}</span>
              <input
                type="number"
                step={o.op === 'pctDelta' ? 1 : o.op === 'multiply' ? 0.05 : (spec?.step ?? 0.01)}
                value={displayValue(o)}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (Number.isNaN(raw)) return;
                  update(o.id, { value: o.op === 'pctDelta' ? raw / 100 : raw });
                }}
                className="mt-0.5 w-full rounded border border-zinc-200 px-1.5 py-1 text-[12px] tabular-nums outline-none focus:border-emerald-500"
              />
            </label>
          </div>

          <div className="flex gap-1.5">
            <label className="flex-1">
              <span className="text-zinc-500">Empieza (mes)</span>
              <input
                type="number"
                min={1}
                max={120}
                value={o.startMonth + 1}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  if (Number.isNaN(m)) return;
                  update(o.id, { startMonth: Math.max(0, Math.min(119, Math.round(m) - 1)) });
                }}
                className="mt-0.5 w-full rounded border border-zinc-200 px-1.5 py-1 text-[12px] tabular-nums outline-none focus:border-emerald-500"
              />
            </label>
            <label className="flex-1">
              <span className="text-zinc-500">Dura (meses)</span>
              <input
                type="number"
                min={1}
                max={120}
                disabled={permanent}
                value={permanent ? '' : o.durationMonths}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  if (Number.isNaN(m)) return;
                  update(o.id, { durationMonths: Math.max(1, Math.round(m)) });
                }}
                className="mt-0.5 w-full rounded border border-zinc-200 px-1.5 py-1 text-[12px] tabular-nums outline-none focus:border-emerald-500 disabled:bg-zinc-100"
              />
            </label>
          </div>

          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={permanent}
              onChange={(e) => update(o.id, { durationMonths: e.target.checked ? PERMANENT : 6 })}
              className="accent-emerald-600"
            />
            <span className="text-zinc-600">No se acaba: es permanente</span>
          </label>

          <div className="flex gap-1.5">
            <label className="flex-1">
              <span className="text-zinc-500">Entra en (meses)</span>
              <input
                type="number"
                min={0}
                max={24}
                value={o.rampInMonths ?? 0}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  if (Number.isNaN(m)) return;
                  update(o.id, { rampInMonths: Math.max(0, Math.round(m)) });
                }}
                className="mt-0.5 w-full rounded border border-zinc-200 px-1.5 py-1 text-[12px] tabular-nums outline-none focus:border-emerald-500"
              />
            </label>
            {permanent ? null : (
              <label className="flex-1">
                <span className="text-zinc-500">Se recupera</span>
                <select
                  value={recovery}
                  onChange={(e) =>
                    update(o.id, {
                      recovery: {
                        type: e.target.value as 'immediate' | 'linear' | 'exponential',
                        months: e.target.value === 'immediate' ? 0 : (o.recovery?.months || 3),
                      },
                    })
                  }
                  className="mt-0.5 w-full rounded border border-zinc-200 bg-white px-1.5 py-1 text-[12px] outline-none focus:border-emerald-500"
                >
                  {RECOVERIES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {!permanent && recovery !== 'immediate' ? (
            <label className="block">
              <span className="text-zinc-500">Tarda en volver (meses)</span>
              <input
                type="number"
                min={1}
                max={48}
                value={o.recovery?.months ?? 3}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  if (Number.isNaN(m)) return;
                  update(o.id, { recovery: { type: recovery, months: Math.max(1, Math.round(m)) } });
                }}
                className="mt-0.5 w-full rounded border border-zinc-200 px-1.5 py-1 text-[12px] tabular-nums outline-none focus:border-emerald-500"
              />
            </label>
          ) : null}

          {permanent ? null : (
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={Boolean(o.repeat)}
                onChange={(e) =>
                  update(o.id, { repeat: e.target.checked ? { everyMonths: 12, times: 10 } : undefined })
                }
                className="accent-emerald-600"
              />
              <span className="text-zinc-600">Se repite todos los años</span>
            </label>
          )}
        </div>
      ) : null}
    </div>
  );
}
