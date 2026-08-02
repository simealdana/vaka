'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { STRESS_BY_ID, instantiate } from '@/lib/assumptions/presets/stress';
import { useAssumptionsStore } from '@/lib/state/useAssumptionsStore';
import { useProjectsStore } from '@/lib/state/useProjectsStore';

/**
 * Lee `?preset=` y monta la prueba de estrés sobre el escenario en edición.
 * Corre después de `useWorkingState` (que vive en el Topbar, montado antes que la página),
 * así que no lo pisa el borrador guardado de la finca.
 */
function PresetApplier({ onApplied }: { onApplied: (label: string) => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const projectId = useProjectsStore((s) => s.activeId);
  const presetId = params.get('preset');
  const done = useRef('');

  useEffect(() => {
    if (!presetId || !projectId) return;
    const key = `${projectId}:${presetId}`;
    if (done.current === key) return;
    const preset = STRESS_BY_ID.get(presetId);
    if (!preset) return;
    done.current = key;

    const store = useAssumptionsStore.getState();
    // Se reemplazan los eventos anteriores: aplicar dos crisis seguidas por URL debe dar la
    // segunda, no las dos apiladas sin que el usuario lo haya pedido.
    store.load({
      edits: store.edits,
      overrides: preset.overrides.map(instantiate),
      name: preset.label,
    });
    onApplied(preset.label);
    router.replace(pathname);
  }, [presetId, projectId, router, pathname, onApplied]);

  return null;
}

export function PresetLoader() {
  const [applied, setApplied] = useState<string | null>(null);

  return (
    <>
      <Suspense fallback={null}>
        <PresetApplier onApplied={setApplied} />
      </Suspense>
      {applied ? (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-900">
          <span className="font-semibold">Prueba de estrés aplicada:</span>
          <span>{applied}</span>
          <button
            type="button"
            onClick={() => {
              useAssumptionsStore.getState().resetAll();
              setApplied(null);
            }}
            className="ml-auto rounded px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
          >
            Quitar
          </button>
        </div>
      ) : null}
    </>
  );
}
