'use client';

import { useEffect, useRef, useState } from 'react';
import type { VariableSpec } from '@/lib/assumptions/schema';
import { formatValue, fromDisplay, signedPct, toDisplay } from '@/lib/format';
import { baseFor, useAssumptionsStore } from '@/lib/state/useAssumptionsStore';

/** El slider va a 60 fps con estado local y solo escribe al store al soltar o tras la pausa. */
const COMMIT_DEBOUNCE_MS = 120;

export function VariableRow({ spec }: { spec: VariableSpec }) {
  const stored = useAssumptionsStore((s) => s.edits[spec.path]);
  const setValue = useAssumptionsStore((s) => s.setValue);
  const resetValue = useAssumptionsStore((s) => s.resetValue);

  const base = useAssumptionsStore((s) => baseFor(spec.path, s.base));
  const committed = stored ?? base;

  const [shadow, setShadow] = useState({ committed, value: committed });
  if (shadow.committed !== committed) setShadow({ committed, value: committed });
  const value = shadow.value;

  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const push = (next: number) => {
    setShadow({ committed, value: next });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setValue(spec.path, next), COMMIT_DEBOUNCE_MS);
  };

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setValue(spec.path, value);
  };

  const commitText = () => {
    if (text === null) return;
    const parsed = Number(text.replace(',', '.'));
    setText(null);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(spec.max, Math.max(spec.min, fromDisplay(parsed, spec)));
    if (timer.current) clearTimeout(timer.current);
    setShadow({ committed, value: clamped });
    setValue(spec.path, clamped);
  };

  const dirty = stored !== undefined;
  const delta = base !== 0 ? value / base - 1 : null;

  return (
    <div className="px-3 py-2 hover:bg-zinc-50">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={spec.id} className="text-[13px] text-zinc-700" title={spec.help}>
          {spec.label}
          {spec.unit ? <span className="ml-1 text-zinc-400">({spec.unit})</span> : null}
        </label>
        {dirty ? (
          <button
            type="button"
            onClick={() => resetValue(spec.path)}
            className="shrink-0 rounded px-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
            title={`Base: ${formatValue(base, spec)}`}
          >
            {delta !== null && spec.kind !== 'boolean' ? signedPct(delta) : 'cambiado'} ↺
          </button>
        ) : null}
      </div>

      {spec.kind === 'boolean' ? (
        <label className="mt-1 flex items-center gap-2 text-[13px] text-zinc-600">
          <input
            id={spec.id}
            type="checkbox"
            checked={value === 1}
            onChange={(e) => {
              const next = e.target.checked ? 1 : 0;
              setShadow({ committed, value: next });
              setValue(spec.path, next);
            }}
            className="size-4 accent-emerald-600"
          />
          {value === 1 ? 'Activado' : 'Desactivado'}
        </label>
      ) : (
        <div className="mt-1 flex items-center gap-2">
          <input
            id={spec.id}
            type="range"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={value}
            onChange={(e) => push(Number(e.target.value))}
            onPointerUp={flush}
            onKeyUp={flush}
            onBlur={flush}
            className="h-1 min-w-0 flex-1 accent-emerald-600"
          />
          <input
            type="text"
            inputMode="decimal"
            value={text ?? String(Number(toDisplay(value, spec).toFixed(4)))}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            className={`w-20 shrink-0 rounded border px-1.5 py-0.5 text-right text-[13px] tabular-nums ${
              dirty ? 'border-amber-300 bg-amber-50' : 'border-zinc-200'
            }`}
          />
        </div>
      )}
    </div>
  );
}
