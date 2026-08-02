'use client';

import Link from 'next/link';
import { type ReactNode, use, useEffect } from 'react';
import { Topbar } from '@/components/Topbar';
import { useProjectsStore } from '@/lib/state/useProjectsStore';

export default function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const setActive = useProjectsStore((s) => s.setActive);
  const refresh = useProjectsStore((s) => s.refresh);
  const hydrated = useProjectsStore((s) => s.hydrated);
  const exists = useProjectsStore((s) => s.list.some((p) => p.id === id));

  // La URL manda sobre la finca activa: fijarla antes de refrescar evita que la lista
  // recién cargada reponga la que estaba guardada en la sesión anterior.
  useEffect(() => {
    setActive(id);
    void refresh();
  }, [id, setActive, refresh]);

  if (hydrated && !exists) {
    return (
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-[14px] text-zinc-600">Esta finca ya no existe.</p>
        <Link
          href="/"
          className="rounded bg-zinc-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-zinc-700"
        >
          Ver todas las fincas
        </Link>
      </main>
    );
  }

  return (
    <>
      <Topbar projectId={id} />
      {children}
    </>
  );
}
