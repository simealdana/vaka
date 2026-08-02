'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ScenarioDrawer } from '@/components/scenarios/ScenarioDrawer';
import { useAssumptionsStore } from '@/lib/state/useAssumptionsStore';
import { activeProject, useProjectsStore } from '@/lib/state/useProjectsStore';
import { useWorkingState } from '@/lib/storage/useWorkingState';

const NAV = [
  { segment: '', label: 'Simulador' },
  { segment: '/comparar', label: 'Comparar' },
  { segment: '/riesgo', label: 'Riesgo' },
  { segment: '/estres', label: 'Estrés' },
  { segment: '/preguntas', label: 'Preguntas' },
];

function NavLinks({ projectId, pathname }: { projectId: string; pathname: string }) {
  const root = `/proyecto/${projectId}`;
  return (
    <>
      {NAV.map((n) => {
        const href = `${root}${n.segment}`;
        return (
          <Link
            key={n.segment}
            href={href}
            className={`shrink-0 whitespace-nowrap rounded px-2.5 py-1.5 text-[12px] font-medium ${
              pathname === href ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </>
  );
}

function ProjectSwitcher() {
  const list = useProjectsStore((s) => s.list);
  const current = useProjectsStore(activeProject);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Finca activa"
        className="flex w-full items-center gap-1 rounded bg-zinc-100 px-2 py-1.5 text-[12px] font-medium text-zinc-800 hover:bg-zinc-200"
      >
        <span className="truncate">🐄 {current?.name ?? 'Sin finca'}</span>
        <span className="text-zinc-400">▾</span>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-1 w-56 max-w-[85vw] rounded border border-zinc-200 bg-white py-1 shadow-lg">
            {list.map((p) => (
              <Link
                key={p.id}
                href={`/proyecto/${p.id}`}
                onClick={() => setOpen(false)}
                className={`block truncate px-3 py-2 text-left text-[13px] hover:bg-zinc-100 ${
                  p.id === current?.id ? 'font-medium text-emerald-700' : 'text-zinc-700'
                }`}
              >
                {p.name}
              </Link>
            ))}
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="mt-1 block border-t border-zinc-100 px-3 py-2 text-[13px] text-zinc-500 hover:bg-zinc-100"
            >
              Ver todas las fincas…
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function Topbar({ projectId }: { projectId: string }) {
  useWorkingState();
  const pathname = usePathname();
  const name = useAssumptionsStore((s) => s.name);
  const setName = useAssumptionsStore((s) => s.setName);
  const edited = useAssumptionsStore((s) => Object.keys(s.edits).length);
  const events = useAssumptionsStore((s) => s.overrides.length);
  const [drawer, setDrawer] = useState(false);

  return (
    <header className="shrink-0 border-b border-zinc-200">
      <div className="flex items-center gap-2 px-3 py-2 lg:gap-3 lg:px-4">
        <Link href="/" className="shrink-0 text-sm font-bold tracking-tight">
          VAKA
        </Link>

        <div className="min-w-0 max-w-[45%] lg:max-w-none">
          <ProjectSwitcher />
        </div>

        <nav className="hidden gap-1 lg:flex">
          <NavLinks projectId={projectId} pathname={pathname} />
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Nombre del escenario"
            className="hidden w-52 rounded border border-transparent px-2 py-1 text-right text-[12px] text-zinc-700 hover:border-zinc-200 focus:border-emerald-500 focus:text-left focus:outline-none sm:block"
          />
          <span className="hidden shrink-0 text-[11px] text-zinc-400 sm:inline">
            {edited} var · {events} eventos
          </span>
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="shrink-0 rounded bg-zinc-100 px-2.5 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-200"
          >
            Escenarios
          </button>
        </div>
      </div>

      <nav className="-mb-px flex gap-1 overflow-x-auto border-t border-zinc-100 px-3 py-1.5 lg:hidden">
        <NavLinks projectId={projectId} pathname={pathname} />
      </nav>

      {drawer ? <ScenarioDrawer onClose={() => setDrawer(false)} /> : null}
    </header>
  );
}
