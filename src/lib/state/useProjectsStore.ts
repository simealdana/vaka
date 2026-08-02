import { create } from 'zustand';
import {
  type Project,
  deleteProject,
  listProjects,
  loadActiveProjectId,
  newId,
  putProject,
  saveActiveProjectId,
  scenarioCounts,
} from '@/lib/storage/persist';
import type { EditMap } from './useAssumptionsStore';

/** Identidad estable: el motor cachea la corrida base por referencia del objeto. */
export const EMPTY_BASE: EditMap = {};

export interface ProjectsStore {
  list: Project[];
  counts: Record<string, number>;
  activeId: string | null;
  hydrated: boolean;
  refresh: () => Promise<void>;
  create: (name: string, base: EditMap) => Promise<Project>;
  update: (id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>) => Promise<void>;
  duplicate: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string) => void;
}

export const useProjectsStore = create<ProjectsStore>((set, get) => ({
  list: [],
  counts: {},
  activeId: null,
  hydrated: false,

  refresh: async () => {
    const [list, counts] = await Promise.all([listProjects(), scenarioCounts()]);
    const stored = get().activeId ?? loadActiveProjectId();
    const activeId = list.some((p) => p.id === stored) ? stored : (list[0]?.id ?? null);
    if (activeId && activeId !== get().activeId) saveActiveProjectId(activeId);
    set({ list, counts, activeId, hydrated: true });
  },

  create: async (name, base) => {
    const now = Date.now();
    const project: Project = { id: newId(), name, base, createdAt: now, updatedAt: now };
    await putProject(project);
    await get().refresh();
    return project;
  },

  update: async (id, patch) => {
    const current = get().list.find((p) => p.id === id);
    if (!current) return;
    await putProject({ ...current, ...patch, updatedAt: Date.now() });
    await get().refresh();
  },

  duplicate: async (id) => {
    const source = get().list.find((p) => p.id === id);
    if (!source) return;
    const now = Date.now();
    await putProject({ ...source, id: newId(), name: `${source.name} (copia)`, createdAt: now, updatedAt: now });
    await get().refresh();
  },

  remove: async (id) => {
    await deleteProject(id);
    if (get().activeId === id) set({ activeId: null });
    await get().refresh();
  },

  setActive: (id) => {
    if (get().activeId === id) return;
    saveActiveProjectId(id);
    set({ activeId: id });
  },
}));

export function activeProject(s: ProjectsStore): Project | null {
  return s.list.find((p) => p.id === s.activeId) ?? null;
}

export function useActiveBase(): EditMap {
  return useProjectsStore((s) => activeProject(s)?.base ?? EMPTY_BASE);
}
