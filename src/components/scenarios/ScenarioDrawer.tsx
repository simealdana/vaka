'use client';

import { useEffect, useRef, useState } from 'react';
import { useAssumptionsStore } from '@/lib/state/useAssumptionsStore';
import { activeProject, useProjectsStore } from '@/lib/state/useProjectsStore';
import { useScenariosStore } from '@/lib/state/useScenariosStore';
import { exportScenarios, importScenarios } from '@/lib/storage/portable';

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ScenarioDrawer({ onClose }: { onClose: () => void }) {
  const { list, activeId, comparing, refresh, save, remove, toggleComparing } = useScenariosStore();
  const load = useAssumptionsStore((s) => s.load);
  const name = useAssumptionsStore((s) => s.name);
  const setName = useAssumptionsStore((s) => s.setName);
  const project = useProjectsStore(activeProject);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const current = () => {
    const s = useAssumptionsStore.getState();
    return { name: s.name, edits: s.edits, overrides: s.overrides };
  };

  const onImport = async (file: File) => {
    try {
      const scenarios = importScenarios(await file.text());
      for (const s of scenarios) await save(s);
      setError(null);
    } catch {
      setError('El archivo no tiene el formato de escenarios de VAKA.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-sm flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Escenarios guardados</h2>
            <p className="text-[11px] text-zinc-400">{project?.name ?? 'Sin finca activa'}</p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
            ✕
          </button>
        </div>

        <div className="space-y-2 border-b border-zinc-200 p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Nombre del escenario"
            placeholder="Nombre del escenario"
            className="w-full rounded border border-zinc-200 px-2 py-1.5 text-[13px] outline-none focus:border-emerald-500"
          />
          <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void save(current())}
            className="flex-1 rounded bg-emerald-600 px-2 py-2 text-[12px] font-medium text-white hover:bg-emerald-700"
          >
            Guardar el actual
          </button>
          <button
            type="button"
            onClick={() => download('escenarios-vaka.json', exportScenarios(list.length ? list : [current()]))}
            className="rounded bg-zinc-100 px-2 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-200"
          >
            Exportar
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded bg-zinc-100 px-2 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-200"
          >
            Importar
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImport(file);
              e.target.value = '';
            }}
          />
          </div>
        </div>

        {error ? <p className="bg-red-50 px-4 py-2 text-[12px] text-red-700">{error}</p> : null}

        <ul className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <li className="p-4 text-[13px] text-zinc-400">
              Todavía no guardaste ninguno. Ajusta los supuestos y pulsa «Guardar el actual».
            </li>
          ) : null}
          {list.map((s) => (
            <li
              key={s.id}
              className={`flex items-center gap-2 border-b border-zinc-100 px-3 py-2 ${
                s.id === activeId ? 'bg-emerald-50' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={comparing.includes(s.id)}
                onChange={() => toggleComparing(s.id)}
                title="Incluir en la comparación"
                className="size-4 accent-emerald-600"
              />
              <button
                type="button"
                onClick={() => {
                  load(s);
                  useScenariosStore.getState().setActive(s.id);
                  onClose();
                }}
                className="min-w-0 flex-1 text-left"
              >
                <div className="truncate text-[13px] font-medium text-zinc-800">{s.name}</div>
                <div className="text-[11px] text-zinc-400">
                  {Object.keys(s.edits).length} variables · {s.overrides.length} eventos
                </div>
              </button>
              <button
                type="button"
                onClick={() => void remove(s.id)}
                className="rounded px-1 text-[12px] text-zinc-400 hover:bg-red-50 hover:text-red-600"
                title="Eliminar"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
