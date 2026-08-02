import { type IDBPDatabase, openDB } from 'idb';
import type { EditMap, ScenarioState } from '@/lib/state/useAssumptionsStore';
import { type PortableScenario, exportScenarios, importScenarios } from './portable';

/** Un proyecto es una finca: su configuración base y, dentro, sus escenarios. */
export interface Project {
  id: string;
  name: string;
  /** Variables que definen esta finca frente a los defaults del motor. */
  base: EditMap;
  createdAt: number;
  updatedAt: number;
}

export interface SavedScenario extends PortableScenario {
  id: string;
  projectId: string;
  updatedAt: number;
}

const DB_NAME = 'vaka';
const PROJECTS = 'projects';
const SCENARIOS = 'scenarios';
const ACTIVE_KEY = 'vaka:project';
const LEGACY_WORKING_KEY = 'vaka:working';

export const DEFAULT_PROJECT_ID = 'finca-1';

const workingKey = (projectId: string) => `${LEGACY_WORKING_KEY}:${projectId}`;

export const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

let dbPromise: Promise<IDBPDatabase> | null = null;

const db = () => {
  dbPromise ??= openDB(DB_NAME, 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) d.createObjectStore(SCENARIOS, { keyPath: 'id' });
      if (oldVersion < 2) d.createObjectStore(PROJECTS, { keyPath: 'id' });
    },
  });
  return dbPromise;
};

export async function listProjects(): Promise<Project[]> {
  const all = (await (await db()).getAll(PROJECTS)) as Project[];
  if (all.length === 0) {
    const now = Date.now();
    const first: Project = {
      id: DEFAULT_PROJECT_ID,
      name: 'Finca de ejemplo',
      base: {},
      createdAt: now,
      updatedAt: now,
    };
    await putProject(first);
    return [first];
  }
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putProject(project: Project): Promise<void> {
  await (await db()).put(PROJECTS, project);
}

export async function deleteProject(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction([PROJECTS, SCENARIOS], 'readwrite');
  void tx.objectStore(PROJECTS).delete(id);
  const scenarios = tx.objectStore(SCENARIOS);
  for (const s of (await scenarios.getAll()) as SavedScenario[]) {
    if ((s.projectId ?? DEFAULT_PROJECT_ID) === id) void scenarios.delete(s.id);
  }
  await tx.done;
  try {
    localStorage.removeItem(workingKey(id));
  } catch {
    // Sin localStorage no hay nada que limpiar.
  }
}

export async function listScenarios(projectId: string): Promise<SavedScenario[]> {
  const all = (await (await db()).getAll(SCENARIOS)) as SavedScenario[];
  // Los escenarios guardados antes de que existieran los proyectos pertenecen a la finca inicial.
  return all
    .filter((s) => (s.projectId ?? DEFAULT_PROJECT_ID) === projectId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putScenario(scenario: SavedScenario): Promise<void> {
  await (await db()).put(SCENARIOS, scenario);
}

export async function deleteScenario(id: string): Promise<void> {
  await (await db()).delete(SCENARIOS, id);
}

/** Cuántos escenarios guardados tiene cada finca, para la tarjeta de /proyectos. */
export async function scenarioCounts(): Promise<Record<string, number>> {
  const all = (await (await db()).getAll(SCENARIOS)) as SavedScenario[];
  const counts: Record<string, number> = {};
  for (const s of all) {
    const key = s.projectId ?? DEFAULT_PROJECT_ID;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * El escenario en edición vive en localStorage (síncrono, sobrevive un F5); los guardados
 * viven en IndexedDB, que aguanta muchos sin competir con el resto del origen.
 */
export function saveWorking(projectId: string, state: ScenarioState & { name: string }): void {
  try {
    localStorage.setItem(workingKey(projectId), exportScenarios([state]));
  } catch {
    // Modo privado o cuota llena: seguir sin persistencia es preferible a romper la app.
  }
}

export function loadWorking(projectId: string): PortableScenario | null {
  try {
    const raw =
      localStorage.getItem(workingKey(projectId)) ??
      (projectId === DEFAULT_PROJECT_ID ? localStorage.getItem(LEGACY_WORKING_KEY) : null);
    return raw ? (importScenarios(raw)[0] ?? null) : null;
  } catch {
    return null;
  }
}

export function loadActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveProjectId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // Ver saveWorking.
  }
}
