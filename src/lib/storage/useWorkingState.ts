'use client';

import { useEffect } from 'react';
import { useAssumptionsStore } from '@/lib/state/useAssumptionsStore';
import { useActiveBase, useProjectsStore } from '@/lib/state/useProjectsStore';
import { loadWorking, saveWorking } from './persist';

const AUTOSAVE_MS = 400;

/**
 * Restaura el escenario en edición de la finca activa y lo va guardando mientras se trabaja.
 * Cada finca tiene su propio borrador: cambiar de proyecto no arrastra los ajustes del anterior.
 */
export function useWorkingState(): boolean {
  const projectId = useProjectsStore((s) => s.activeId);
  const base = useActiveBase();

  useEffect(() => {
    void useProjectsStore.getState().refresh();
  }, []);

  useEffect(() => {
    useAssumptionsStore.setState({ base });
  }, [base]);

  useEffect(() => {
    if (!projectId) return;
    const saved = loadWorking(projectId);
    useAssumptionsStore
      .getState()
      .load(saved ?? { edits: {}, overrides: [], name: 'Escenario base' });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useAssumptionsStore.subscribe((s) => {
      clearTimeout(timer);
      timer = setTimeout(
        () => saveWorking(projectId, { edits: s.edits, overrides: s.overrides, name: s.name }),
        AUTOSAVE_MS,
      );
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [projectId]);

  return projectId !== null;
}
