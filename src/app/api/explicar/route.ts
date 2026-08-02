import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  scenarioName: z.string().max(120),
  draft: z.array(z.object({ title: z.string(), items: z.array(z.string()) })).max(8),
  loss: z.record(z.string(), z.union([z.number(), z.string()])),
  annual: z
    .array(
      z.object({
        year: z.number(),
        ingresos: z.number(),
        costos: z.number(),
        ebitda: z.number(),
        caja: z.number(),
        patrimonio: z.number(),
        litros: z.number(),
        hato: z.number(),
      }),
    )
    .max(12),
});

const SYSTEM = `Eres un asesor financiero especializado en ganadería de doble propósito en América Latina.
Escribes en español llano, directo, sin tecnicismos innecesarios, tuteando al productor.

Reglas absolutas:
- Está PROHIBIDO inventar cifras. Usa exclusivamente los números que aparecen en los datos recibidos.
- Está PROHIBIDO recalcular: si un número no está en los datos, no lo menciones.
- No repitas el borrador palabra por palabra: enlázalo en una explicación que se lea de corrido.
- Sigue siempre la cadena causal: qué cambió → qué pasa en la operación → qué pasa con la caja →
  qué pasa con el patrimonio → qué decisión toca tomar.
- Máximo cinco párrafos cortos. Sin listas con viñetas, sin títulos, sin markdown.`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'Falta ANTHROPIC_API_KEY en el servidor. La explicación determinista sigue disponible.' },
      { status: 501 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: `Escenario: ${body.scenarioName}

Borrador determinista (todas las cifras aquí son correctas):
${body.draft.map((s) => `${s.title}\n${s.items.map((i) => `- ${i}`).join('\n')}`).join('\n\n')}

Descomposición de la pérdida:
${JSON.stringify(body.loss)}

Resumen anual:
${JSON.stringify(body.annual)}`,
      },
    ],
  });

  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } catch {
          controller.enqueue(encoder.encode('\n\n[Se interrumpió la conexión con el modelo.]'));
        }
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
}
