'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { DEFAULT_ASSUMPTIONS } from '@/engine/defaults';
import type { ParamPath } from '@/engine/types';
import { VARIABLES_BY_ID, baseValue } from '@/lib/assumptions/schema';
import { fromDisplay, money, toDisplay } from '@/lib/format';
import type { EditMap } from '@/lib/state/useAssumptionsStore';
import { useProjectsStore } from '@/lib/state/useProjectsStore';

/** Lo técnico: qué tiene la finca. El resto de supuestos sale de los defaults. */
const TECH = ['cows', 'heifers', 'hectares', 'litersPerCowDay', 'industryPrice'].map((id) => {
  const spec = VARIABLES_BY_ID.get(id);
  if (!spec) throw new Error(`Falta la variable ${id} en el esquema`);
  return spec;
});

/** Lo monetario: qué costó. Son precios unitarios porque así se negocia una finca. */
const MONEY = [
  { id: 'pricePerHa', label: 'Precio por hectárea', unit: 'USD/ha', initial: 1800 },
  { id: 'pricePerHead', label: 'Precio por cabeza', unit: 'USD', initial: 850 },
  { id: 'infrastructure', label: 'Instalaciones y equipos', unit: 'USD', initial: 85000 },
  { id: 'initialCash', label: 'Caja de arranque', unit: 'USD', initial: 25000 },
  { id: 'loan', label: 'Préstamo', unit: 'USD', initial: 0 },
] as const;

const parse = (raw: string): number => {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export function NewProjectForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const create = useProjectsStore((s) => s.create);
  const setActive = useProjectsStore((s) => s.setActive);
  const [name, setName] = useState('');
  const [tech, setTech] = useState<Record<string, string>>(() =>
    Object.fromEntries(TECH.map((s) => [s.id, String(toDisplay(baseValue(s), s))])),
  );
  const [cost, setCost] = useState<Record<string, string>>(() =>
    Object.fromEntries(MONEY.map((f) => [f.id, String(f.initial)])),
  );

  const plan = useMemo(() => {
    const hectares = parse(tech.hectares);
    // Machos y toros no se preguntan en el alta, pero sí se compran: van a precio de lista.
    const head =
      parse(tech.cows) + parse(tech.heifers) + DEFAULT_ASSUMPTIONS.herd.males + DEFAULT_ASSUMPTIONS.herd.bulls;
    const land = hectares * parse(cost.pricePerHa);
    const herd = head * parse(cost.pricePerHead);
    const infrastructure = parse(cost.infrastructure);
    const total = land + herd + infrastructure;
    return {
      hectares,
      land,
      herd,
      infrastructure,
      total,
      ownFunds: total + parse(cost.initialCash) - parse(cost.loan),
    };
  }, [tech, cost]);

  const submit = async () => {
    const base: Record<ParamPath, number> = {};
    for (const spec of TECH) {
      const clamped = Math.min(spec.max, Math.max(spec.min, fromDisplay(parse(tech[spec.id]), spec)));
      base[spec.path] = clamped;
    }
    // La superficie de pastoreo y la superficie en el balance son la misma tierra.
    base['capital.landHectares'] = plan.hectares;
    base['capital.landPricePerHa'] = parse(cost.pricePerHa);
    base['acquisition.isPurchase'] = 1;
    base['acquisition.landCost'] = plan.land;
    base['acquisition.herdCost'] = plan.herd;
    base['acquisition.infrastructureCost'] = plan.infrastructure;
    base['acquisition.closingCost'] = 0;
    base['capital.fixedAssetsValue'] = plan.infrastructure;
    base['capital.initialCash'] = parse(cost.initialCash);
    base['capital.debtPrincipal'] = parse(cost.loan);

    const project = await create(name.trim() || 'Finca sin nombre', base as EditMap);
    setActive(project.id);
    router.push(`/proyecto/${project.id}`);
  };

  const field = (
    key: string,
    label: string,
    unit: string | undefined,
    value: string,
    onChange: (next: string) => void,
  ) => (
    <label key={key} className="flex items-center justify-between gap-2">
      <span className="text-[12px] text-zinc-500">
        {label}
        {unit ? <span className="ml-1 text-zinc-400">({unit})</span> : null}
      </span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 rounded border border-zinc-200 px-1.5 py-0.5 text-right text-[13px] tabular-nums outline-none focus:border-emerald-500"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="max-h-full w-full max-w-sm space-y-3 overflow-y-auto rounded-lg bg-white p-4 shadow-xl"
      >
        <h2 className="text-sm font-semibold">Nueva finca</h2>

        <label className="block">
          <span className="text-[12px] text-zinc-500">Nombre</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Finca La Esperanza"
            className="mt-0.5 w-full rounded border border-zinc-200 px-2 py-1 text-[13px] outline-none focus:border-emerald-500"
          />
        </label>

        <p className="pt-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">Qué tiene</p>
        {TECH.map((spec) =>
          field(spec.id, spec.label, spec.unit, tech[spec.id], (next) =>
            setTech((v) => ({ ...v, [spec.id]: next })),
          ),
        )}

        <p className="pt-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">Qué costó</p>
        {MONEY.map((f) =>
          field(f.id, f.label, f.unit, cost[f.id], (next) => setCost((v) => ({ ...v, [f.id]: next }))),
        )}

        <dl className="space-y-0.5 rounded bg-zinc-50 p-2 text-[12px]">
          <div className="flex justify-between text-zinc-500">
            <dt>Terreno</dt>
            <dd className="tabular-nums">{money(plan.land)}</dd>
          </div>
          <div className="flex justify-between text-zinc-500">
            <dt>Hato</dt>
            <dd className="tabular-nums">{money(plan.herd)}</dd>
          </div>
          <div className="flex justify-between text-zinc-500">
            <dt>Instalaciones</dt>
            <dd className="tabular-nums">{money(plan.infrastructure)}</dd>
          </div>
          <div className="flex justify-between border-t border-zinc-200 pt-0.5 font-medium text-zinc-800">
            <dt>Aporte propio</dt>
            <dd className="tabular-nums">{money(plan.ownFunds)}</dd>
          </div>
        </dl>

        <p className="text-[11px] text-zinc-400">
          El aporte propio es lo que sale de tu bolsillo en el mes 0 y es la referencia de la TIR.
          Todo lo demás sale de los supuestos por defecto y lo ajustas dentro de la finca.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-[12px] font-medium text-zinc-600 hover:bg-zinc-100"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded bg-emerald-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-emerald-700"
          >
            Crear y abrir
          </button>
        </div>
      </form>
    </div>
  );
}
