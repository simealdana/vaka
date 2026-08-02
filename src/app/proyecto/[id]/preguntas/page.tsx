'use client';

import { useEffect, useState } from 'react';
import { type Answer, solveQuestions } from '@/lib/questions/solve';
import { type EditMap, useAssumptionsStore } from '@/lib/state/useAssumptionsStore';

export default function PreguntasPage() {
  const projectBase = useAssumptionsStore((s) => s.base);
  const [result, setResult] = useState<{ base: EditMap; answers: Answer[] } | null>(null);

  // Son cientos de simulaciones: se resuelven fuera del render para que la página pinte
  // el encabezado antes de bloquearse, en vez de quedarse en blanco.
  useEffect(() => {
    const timer = setTimeout(
      () => setResult({ base: projectBase, answers: solveQuestions(projectBase) }),
      30,
    );
    return () => clearTimeout(timer);
  }, [projectBase]);

  // Si cambió la finca, lo que hay guardado es de otra: hay que volver a esperar.
  const answers = result?.base === projectBase ? result.answers : null;

  return (
    <main className="min-h-0 flex-1 overflow-auto bg-zinc-50 p-3 sm:p-4">
      <div className="mb-3">
        <h1 className="text-sm font-semibold">Las quince preguntas</h1>
        <p className="mt-0.5 max-w-2xl text-[12px] text-zinc-500">
          Respondidas por búsqueda sobre el motor, no por opinión. Cada respuesta dice cómo se
          calculó para que puedas discutir el número. Todo se mide contra la finca base de este
          proyecto, sin el escenario que tengas en edición.
        </p>
      </div>

      {answers === null ? (
        <p className="rounded-lg border border-zinc-200 bg-white p-4 text-[13px] text-zinc-500">
          Buscando los límites… se corren cientos de simulaciones.
        </p>
      ) : (
        <ol className="space-y-3">
          {answers.map((a, i) => (
            <li key={a.id}>
              <article className="rounded-lg border border-zinc-200 bg-white p-3 sm:p-4">
                <h2 className="text-[13px] font-semibold text-zinc-900">
                  <span className="mr-1.5 text-zinc-400">{i + 1}.</span>
                  {a.question}
                </h2>
                <p className="mt-1.5 text-[13px] leading-snug text-emerald-800">{a.headline}</p>

                <dl className="mt-2.5 grid gap-x-4 gap-y-1 border-t border-zinc-100 pt-2 text-[12px] sm:grid-cols-2">
                  {a.rows.map((r) => (
                    <div key={r.label} className="flex justify-between gap-3">
                      <dt className="min-w-0 text-zinc-500">{r.label}</dt>
                      <dd
                        className={`shrink-0 text-right tabular-nums ${
                          r.key ? 'font-semibold text-zinc-900' : 'text-zinc-700'
                        }`}
                      >
                        {r.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                <p className="mt-2 border-t border-zinc-100 pt-2 text-[11px] leading-snug text-zinc-500">
                  <span className="font-medium text-zinc-600">Cómo se calculó: </span>
                  {a.method}
                </p>
                {a.caveat ? (
                  <p className="mt-1 text-[11px] leading-snug text-amber-700">⚠ {a.caveat}</p>
                ) : null}
              </article>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
