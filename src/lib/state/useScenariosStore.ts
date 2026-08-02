import { create } from 'zustand';
import {
  type SavedScenario,
  deleteScenario,
  listScenarios,
  newId,
  putScenario,
} from '@/lib/storage/persist';
import type { PortableScenario } from '@/lib/storage/portable';
import { useProjectsStore } from './useProjectsStore';

interface ScenariosStore {
  /** Solo los escenarios de la finca activa. */
  list: SavedScenario[];
  activeId: string | null;
  /** Escenarios elegidos en la pantalla de comparación. */
  comparing: string[];
  refresh: () => Promise<void>;
  save: (scenario: PortableScenario, id?: string) => Promise<SavedScenario | null>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string | null) => void;
  toggleComparing: (id: string) => void;
}

export const useScenariosStore = create<ScenariosStore>((set, get) => ({
  list: [],
  activeId: null,
  comparing: [],

  refresh: async () => {
    const projectId = useProjectsStore.getState().activeId;
    set({ list: projectId ? await listScenarios(projectId) : [] });
  },

  save: async (scenario, id) => {
    const projectId = useProjectsStore.getState().activeId;
    if (!projectId) return null;
    const saved: SavedScenario = { ...scenario, id: id ?? newId(), projectId, updatedAt: Date.now() };
    await putScenario(saved);
    await get().refresh();
    await useProjectsStore.getState().refresh();
    set({ activeId: saved.id });
    return saved;
  },

  remove: async (id) => {
    await deleteScenario(id);
    await get().refresh();
    await useProjectsStore.getState().refresh();
    set((s) => ({
      activeId: s.activeId === id ? null : s.activeId,
      comparing: s.comparing.filter((c) => c !== id),
    }));
  },

  setActive: (activeId) => set({ activeId }),

  toggleComparing: (id) =>
    set((s) => ({
      comparing: s.comparing.includes(id) ? s.comparing.filter((c) => c !== id) : [...s.comparing, id],
    })),
}));

// Cambiar de finca vacía la lista de escenarios y la selección de comparación.
useProjectsStore.subscribe((s, prev) => {
  if (s.activeId === prev.activeId) return;
  useScenariosStore.setState({ list: [], activeId: null, comparing: [] });
  void useScenariosStore.getState().refresh();
});
