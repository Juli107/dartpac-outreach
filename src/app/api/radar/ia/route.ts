import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, iaConfigurada, parsearJson, pedirTexto, type Msg } from "@/lib/radar/claude";
import { sumarUsoIa } from "@/lib/radar/uso";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  input: z.union([z.string().max(40_000), z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(40_000) })).min(1).max(40)]),
  modelTier: z.enum(["quick", "default", "complex"]).optional(),
  json: z.boolean().optional(),
});

/** IA para el Radar y Outreach (redactar mensajes, clasificar respuestas, describir empresas). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_argument" }, { status: 400 });
  if (!iaConfigurada()) return NextResponse.json({ error: "not_granted", detail: "Falta configurar la API de Claude (ANTHROPIC_API_KEY)." }, { status: 503 });
  const { input, modelTier, json } = parsed.data;
  try {
    const r = await pedirTexto(input as string | Msg[], { rapido: modelTier === "quick", json, maxTokens: modelTier === "complex" ? 3000 : 1500 });
    await sumarUsoIa(r.uso).catch(() => null);
    if (json) {
      try {
        return NextResponse.json({ value: parsearJson(r.text) });
      } catch {
        return NextResponse.json({ error: "upstream_error", detail: "La IA no devolvió un formato válido." }, { status: 502 });
      }
    }
    return NextResponse.json({ text: r.text, truncated: r.truncated });
  } catch (e) {
    const status = e instanceof ApiError && e.status === 429 ? 429 : 502;
    return NextResponse.json({ error: status === 429 ? "rate_limited" : "upstream_error", detail: e instanceof Error ? e.message : String(e) }, { status });
  }
}
