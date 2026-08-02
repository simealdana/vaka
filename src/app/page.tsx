'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { NewProjectForm } from '@/components/projects/NewProjectForm';
import { decimals, money, relativeTime } from '@/lib/format';
import { baselineOutput } from '@/lib/sim/useSimulation';
import { buildAssumptions } from '@/lib/state/useAssumptionsStore';
import { useProjectsStore } from '@/lib/state/useProjectsStore';
import { type Project, listScenarios } from '@/lib/storage/persist';
import { exportScenarios } from '@/lib/storage/portable';

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const slug = (name: string) =>
  name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'finca';

function ProjectCard({ project, scenarios }: { project: Project; scenarios: number }) {
  const duplicate = useProjectsStore((s) => s.duplicate);
  const remove = useProjectsStore((s) => s.remove);
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const kpi = useMemo(() => {
    const output = baselineOutput(project.base);
    return {
      heads: output.months[0]?.herd.total ?? 0,
      hectares: buildAssumptions(project.base).feed.hectares,
      equity: output.summary.finalBookEquity,
      investment: output.summary.initialInvestment,
    };
  }, [project.base]);

  const onExport = async () => {
    const saved = await listScenarios(project.id);
    download(
      `${slug(project.name)}.json`,
      exportScenarios([{ name: `${project.name} · base`, edits: project.base, overrides: [] }, ...saved]),
    );
    setMenu(false);
  };

  return (
    <li className="flex flex-col gap-2 border-b border-zinc-100 px-3 py-3 hover:bg-zinc-50 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link
            href={`/proyecto/${project.id}`}
            className="truncate text-[14px] font-medium text-zinc-900 hover:text-emerald-700"
          >
            {project.name}
          </Link>
          <span className="text-[12px] text-zinc-400">
            {scenarios} escenario{scenarios === 1 ? '' : 's'}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-zinc-500 tabular-nums">
          {Math.round(kpi.heads)} cabezas · {decimals(kpi.hectares, 0)} ha
        </p>
        <p className="text-[12px] text-zinc-500 tabular-nums">
          inversión {money(kpi.investment)} · patrimonio {money(kpi.equity)}
        </p>
        <p className="text-[11px] text-zinc-400">editada {relativeTime(project.updatedAt)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={`/proyecto/${project.id}`}
          className="flex-1 rounded bg-zinc-900 px-3 py-2 text-center text-[13px] font-medium text-white hover:bg-zinc-700 sm:flex-none sm:py-1 sm:text-[12px]"
        >
          Abrir
        </Link>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-label={`Más acciones de ${project.name}`}
            className="rounded px-3 py-2 text-[14px] text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 sm:px-2 sm:py-1"
          >
            ⋯
          </button>
          {menu ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 z-20 mt-1 w-40 rounded border border-zinc-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    void duplicate(project.id);
                    setMenu(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-[13px] text-zinc-700 hover:bg-zinc-100"
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  onClick={() => void onExport()}
                  className="block w-full px-3 py-2 text-left text-[13px] text-zinc-700 hover:bg-zinc-100"
                >
                  Exportar JSON
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(false);
                    setConfirming(true);
                  }}
                  className="block w-full px-3 py-2 text-left text-[13px] text-red-600 hover:bg-red-50"
                >
                  Borrar
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-lg bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold">Borrar «{project.name}»</h3>
            <p className="text-[13px] text-zinc-600">
              Se borran también sus {scenarios} escenario{scenarios === 1 ? '' : 's'} guardado
              {scenarios === 1 ? '' : 's'}. No se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded px-3 py-2 text-[13px] font-medium text-zinc-600 hover:bg-zinc-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void remove(project.id)}
                className="rounded bg-red-600 px-3 py-2 text-[13px] font-medium text-white hover:bg-red-700"
              >
                Borrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export default function FincasPage() {
  const list = useProjectsStore((s) => s.list);
  const counts = useProjectsStore((s) => s.counts);
  const hydrated = useProjectsStore((s) => s.hydrated);
  const refresh = useProjectsStore((s) => s.refresh);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
  }, [list, query]);

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-200 px-4 py-2">
        <span className="text-sm font-bold tracking-tight">VAKA</span>
        <span className="truncate text-[12px] text-zinc-500">Simulador de fincas de doble propósito</span>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto bg-zinc-50 p-3 sm:p-6">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="flex flex-col gap-2 border-b border-zinc-200 px-3 py-3 sm:flex-row sm:items-center sm:px-4">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded bg-emerald-600 px-3 py-2 text-[13px] font-medium text-white hover:bg-emerald-700 sm:py-1.5 sm:text-[12px]"
            >
              + Nueva finca
            </button>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar finca…"
              className="rounded border border-zinc-200 px-2 py-2 text-[13px] outline-none focus:border-emerald-500 sm:ml-auto sm:w-56 sm:py-1"
            />
          </div>

          <ul>
            {shown.map((p) => (
              <ProjectCard key={p.id} project={p} scenarios={counts[p.id] ?? 0} />
            ))}
          </ul>

          {hydrated && shown.length === 0 ? (
            <p className="p-6 text-center text-[13px] text-zinc-400">
              {query ? 'Ninguna finca coincide.' : 'Todavía no hay fincas. Crea la primera.'}
            </p>
          ) : null}
        </div>
      </main>

      {creating ? <NewProjectForm onClose={() => setCreating(false)} /> : null}
    </>
  );
}
