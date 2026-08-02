'use client';

import { useState } from 'react';
import type { OverrideOp, ParamPath, ScenarioOverride } from '@/engine/types';
import { GROUPS, VARIABLES, VARIABLES_BY_PATH } from '@/lib/assumptions/schema';
import { formatValue, fromDisplay, monthLabel, toDisplay } from '@/lib/format';
import { baseFor, useAssumptionsStore } from '@/lib/state/useAssumptionsStore';

/** Las variables que tiene sentido golpear con un evento: números, nunca interruptores. */
const TARGET_GROUPS = GROUPS.map((g) => ({
  label: g.label,
  specs: VARIABLES.filter((s) => s.group === g.id && s.kind !== 'boolean'),
})).filter((g) => g.specs.length > 0);

const OPS: { id: OverrideOp; label: string; help: string }[] = [
  { id: 'pctDelta', label: 'cambia un %', help: 'Escribe −30 para una caída del 30%.' },
  { id: 'set', label: 'queda en', help: 'El valor pasa a ser exactamente este.' },
  { id: 'add', label: 'suma', help: 'Se le suma esta cantidad al valor actual.' },
];

const RECOVERIES: { id: NonNullable<ScenarioOverride['recovery']>['type']; label: string }[] = [
  { id: 'immediate', label: 'de golpe' },
  { id: 'linear', label: 'poco a poco' },
  { id: 'exponential', label: 'rápido y luego lento' },
  { id: 'none', label: 'no se recupera' },
];

const DEFAULT_TARGET: ParamPath = 'channels.industryPricePerLiter';

const parse = (raw: string): number => {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

interface Draft {
  target: ParamPath;
  op: OverrideOp;
  value: string;
  startMonth: string;
  durationMonths: string;
  permanent: boolean;
  rampInMonths: string;
  recovery: NonNullable<ScenarioOverride['recovery']>['type'];
  recoveryMonths: string;
  label: string;
}

function toDraft(event: ScenarioOverride | null): Draft {
  if (!event) {
    return {
      target: DEFAULT_TARGET,
      op: 'pctDelta',
      value: '-30',
      startMonth: '13',
      durationMonths: '6',
      permanent: false,
      rampInMonths: '0',
      recovery: 'linear',
      recoveryMonths: '3',
      label: '',
    };
  }
  const spec = VARIABLES_BY_PATH.get(event.target);
  const shown =
    event.op === 'pctDelta'
      ? event.value * 100
      : spec && event.op !== 'multiply'
        ? toDisplay(event.value, spec)
        : event.value;
  return {
    target: event.target,
    op: event.op,
    value: String(Number(shown.toFixed(4))),
    startMonth: String(event.startMonth + 1),
    durationMonths: Number.isFinite(event.durationMonths) ? String(event.durationMonths) : '6',
    permanent: !Number.isFinite(event.durationMonths),
    rampInMonths: String(event.rampInMonths ?? 0),
    recovery: event.recovery?.type ?? 'immediate',
    recoveryMonths: String(event.recovery?.months ?? 3),
    label: event.label,
  };
}

/**
 * El mes se teclea en base 1 porque así lo cuenta el productor («el mes 13»), pero el motor
 * indexa desde 0. La conversión vive solo aquí.
 */
function toOverride(draft: Draft, spec: ReturnType<typeof VARIABLES_BY_PATH.get>): Omit<ScenarioOverride, 'id'> {
  const raw = parse(draft.value);
  const value =
    draft.op === 'pctDelta' ? raw / 100 : spec && draft.op !== 'multiply' ? fromDisplay(raw, spec) : raw;
  const recoveryType = draft.recovery;
  return {
    label: draft.label.trim() || `${spec?.label ?? draft.target}`,
    target: draft.target,
    op: draft.op,
    value,
    startMonth: Math.max(0, Math.round(parse(draft.startMonth)) - 1),
    durationMonths: draft.permanent
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.round(parse(draft.durationMonths))),
    rampInMonths: Math.max(0, Math.round(parse(draft.rampInMonths))) || undefined,
    recovery: { type: recoveryType, months: Math.max(0, Math.round(parse(draft.recoveryMonths))) },
  };
}

export function EventForm({ event, onClose }: { event: ScenarioOverride | null; onClose: () => void }) {
  const addOverride = useAssumptionsStore((s) => s.addOverride);
  const updateOverride = useAssumptionsStore((s) => s.updateOverride);
  const projectBase = useAssumptionsStore((s) => s.base);
  const [draft, setDraft] = useState<Draft>(() => toDraft(event));
  const [advanced, setAdvanced] = useState(false);

  const spec = VARIABLES_BY_PATH.get(draft.target);
  const current = baseFor(draft.target, projectBase);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = () => {
    const next = toOverride(draft, spec);
    if (event) updateOverride(event.id, next);
    else addOverride({ ...next, id: crypto.randomUUID() });
    onClose();
  };

  const field = (label: string, node: React.ReactNode) => (
    <label className="block">
      <span className="text-[11px] text-zinc-500">{label}</span>
      {node}
    </label>
  );

  const inputClass =
    'mt-0.5 w-full rounded border border-zinc-200 bg-white px-2 py-1 text-[12px] outline-none focus:border-emerald-500';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-sm space-y-2 overflow-y-auto rounded-t-lg bg-white p-3 shadow-xl sm:rounded-lg"
      >
        <h3 className="text-[13px] font-semibold">{event ? 'Editar evento' : 'Nuevo evento'}</h3>

        {field(
          'Qué variable se mueve',
          <select
            value={draft.target}
            onChange={(e) => set('target', e.target.value as ParamPath)}
            className={inputClass}
          >
            {TARGET_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.specs.map((s) => (
                  <option key={s.id} value={s.path}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>,
        )}

        <p className="text-[11px] text-zinc-400">
          Hoy vale {spec ? formatValue(current, spec) : current}
          {spec?.unit ? ` ${spec.unit}` : ''}
        </p>

        <div className="flex gap-2">
          <div className="flex-1">
            {field(
              'Qué le pasa',
              <select
                value={draft.op}
                onChange={(e) => set('op', e.target.value as OverrideOp)}
                className={inputClass}
              >
                {OPS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>,
            )}
          </div>
          <div className="w-24">
            {field(
              draft.op === 'pctDelta' ? 'Cuánto (%)' : 'Cuánto',
              <input
                inputMode="decimal"
                value={draft.value}
                onChange={(e) => set('value', e.target.value)}
                className={`${inputClass} text-right tabular-nums`}
              />,
            )}
          </div>
        </div>

        <p className="text-[11px] text-zinc-400">{OPS.find((o) => o.id === draft.op)?.help}</p>

        <div className="flex gap-2">
          <div className="flex-1">
            {field(
              'Empieza en el mes',
              <input
                inputMode="numeric"
                value={draft.startMonth}
                onChange={(e) => set('startMonth', e.target.value)}
                className={`${inputClass} text-right tabular-nums`}
              />,
            )}
          </div>
          <div className="flex-1">
            {field(
              'Dura (meses)',
              <input
                inputMode="numeric"
                value={draft.durationMonths}
                disabled={draft.permanent}
                onChange={(e) => set('durationMonths', e.target.value)}
                className={`${inputClass} text-right tabular-nums disabled:bg-zinc-100 disabled:text-zinc-400`}
              />,
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-[12px] text-zinc-600">
          <input
            type="checkbox"
            checked={draft.permanent}
            onChange={(e) => set('permanent', e.target.checked)}
            className="size-4 accent-emerald-600"
          />
          Es permanente, no vuelve atrás
        </label>

        <button
          type="button"
          onClick={() => setAdvanced((a) => !a)}
          className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800"
        >
          {advanced ? '▾' : '▸'} Cómo entra y cómo sale
        </button>

        {advanced ? (
          <div className="space-y-2 rounded bg-zinc-50 p-2">
            {field(
              'Tarda en llegar a pleno efecto (meses)',
              <input
                inputMode="numeric"
                value={draft.rampInMonths}
                onChange={(e) => set('rampInMonths', e.target.value)}
                className={`${inputClass} text-right tabular-nums`}
              />,
            )}
            <div className="flex gap-2">
              <div className="flex-1">
                {field(
                  'Al terminar se recupera',
                  <select
                    value={draft.recovery}
                    onChange={(e) => set('recovery', e.target.value as Draft['recovery'])}
                    className={inputClass}
                  >
                    {RECOVERIES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>,
                )}
              </div>
              <div className="w-20">
                {field(
                  'en (meses)',
                  <input
                    inputMode="numeric"
                    value={draft.recoveryMonths}
                    disabled={draft.recovery === 'immediate' || draft.recovery === 'none'}
                    onChange={(e) => set('recoveryMonths', e.target.value)}
                    className={`${inputClass} text-right tabular-nums disabled:bg-zinc-100 disabled:text-zinc-400`}
                  />,
                )}
              </div>
            </div>
          </div>
        ) : null}

        {field(
          'Nombre (opcional)',
          <input
            value={draft.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder={spec?.label ?? 'Mi evento'}
            className={inputClass}
          />,
        )}

        <p className="rounded bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-500">
          Arranca en {monthLabel(Math.max(0, Math.round(parse(draft.startMonth)) - 1))}
          {draft.permanent
            ? ' y no vuelve atrás.'
            : ` y dura ${Math.max(1, Math.round(parse(draft.durationMonths)))} meses.`}
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1.5 text-[12px] font-medium text-zinc-600 hover:bg-zinc-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded bg-emerald-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-emerald-700"
          >
            {event ? 'Guardar' : 'Añadir'}
          </button>
        </div>
      </div>
    </div>
  );
}
