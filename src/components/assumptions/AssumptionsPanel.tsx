'use client';

import { useMemo, useState } from 'react';
import { TimelineEditor } from '@/components/events/TimelineEditor';
import { GROUPS, type GroupId, VARIABLES, type VariableSpec, searchVariables } from '@/lib/assumptions/schema';
import { useAssumptionsStore } from '@/lib/state/useAssumptionsStore';
import { useProjectsStore } from '@/lib/state/useProjectsStore';
import { VariableRow } from './VariableRow';

type Filter = 'destacadas' | 'todas' | 'cambiadas';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'destacadas', label: 'Destacadas' },
  { id: 'todas', label: 'Todas' },
  { id: 'cambiadas', label: 'Δ Cambiadas' },
];

export function AssumptionsPanel() {
  const edits = useAssumptionsStore((s) => s.edits);
  const resetAll = useAssumptionsStore((s) => s.resetAll);
  const projectId = useProjectsStore((s) => s.activeId);
  const updateProject = useProjectsStore((s) => s.update);
  const [filter, setFilter] = useState<Filter>('destacadas');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Partial<Record<GroupId, boolean>>>({});

  const editedCount = Object.keys(edits).length;

  const visible = useMemo(() => {
    let pool: VariableSpec[] = VARIABLES;
    if (filter === 'destacadas') pool = pool.filter((s) => s.tier === 'destacada' || s.path in edits);
    else if (filter === 'cambiadas') pool = pool.filter((s) => s.path in edits);
    return searchVariables(query, pool);
  }, [filter, query, edits]);

  const byGroup = useMemo(() => {
    const map = new Map<GroupId, VariableSpec[]>();
    for (const spec of visible) {
      const list = map.get(spec.group);
      if (list) list.push(spec);
      else map.set(spec.group, [spec]);
    }
    return map;
  }, [visible]);

  const searching = query.trim().length > 0;

  /** Lo que hoy es un escenario pasa a ser cómo es la finca: deja de contar como cambio. */
  const promoteToBase = async () => {
    if (!projectId) return;
    const { base, edits: current } = useAssumptionsStore.getState();
    await updateProject(projectId, { base: { ...base, ...current } });
    resetAll();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-zinc-200 p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Supuestos</h2>
          {editedCount > 0 ? (
            <button
              type="button"
              onClick={resetAll}
              className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-200"
            >
              {editedCount} modificad{editedCount === 1 ? 'a' : 'as'} · restablecer
            </button>
          ) : null}
        </div>
        {editedCount > 0 ? (
          <button
            type="button"
            onClick={() => void promoteToBase()}
            className="w-full rounded bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-200"
            title="Estos valores dejan de ser un escenario y pasan a describir la finca"
          >
            Fijar como configuración de la finca
          </button>
        ) : null}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar variable…"
          className="w-full rounded border border-zinc-200 px-2 py-1 text-[13px] outline-none focus:border-emerald-500"
        />
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`flex-1 rounded px-2 py-1 text-[11px] font-medium ${
                filter === f.id ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="p-4 text-[13px] text-zinc-400">Ninguna variable coincide.</p>
        ) : null}
        {GROUPS.map((group) => {
          const specs = byGroup.get(group.id);
          if (!specs?.length) return null;
          const changed = specs.filter((s) => s.path in edits).length;
          const open = searching || !collapsed[group.id];
          return (
            <section key={group.id} className="border-b border-zinc-100">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] }))}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium text-zinc-800 hover:bg-zinc-50"
              >
                <span className="text-zinc-400">{open ? '▾' : '▸'}</span>
                <span className="flex-1">{group.label}</span>
                {changed > 0 ? (
                  <span className="rounded bg-amber-100 px-1.5 text-[11px] text-amber-800">{changed} ✎</span>
                ) : null}
                <span className="text-[11px] text-zinc-400">{specs.length}</span>
              </button>
              {open ? <div className="pb-1">{specs.map((s) => <VariableRow key={s.id} spec={s} />)}</div> : null}
            </section>
          );
        })}
        {searching ? null : <TimelineEditor />}
      </div>
    </div>
  );
}
