import { NextResponse, after } from "next/server";
import { z } from "zod";
import { despertar, parsearPedido, procesar } from "@/lib/radar/worker";
import { getDoc } from "@/lib/radar/store";
import { iaConfigurada } from "@/lib/radar/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({ text: z.string().optional(), id: z.string().optional(), col: z.enum(["busquedas", "pedidos"]).optional() });

/**
 * El Radar pide arrancar una búsqueda o un pedido (antes lo hacía con la tarea programada de Claude).
 * Responde enseguida y sigue trabajando en segundo plano; si no termina en este tramo, se encadena sola.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_argument" }, { status: 400 });
  const job = parsed.data.id ? { col: parsed.data.col ?? "busquedas", id: parsed.data.id } : parsearPedido(parsed.data.text ?? "");
  if (!job) return NextResponse.json({ error: "invalid_argument", detail: "No se entendió qué búsqueda arrancar." }, { status: 400 });
  if (!(await getDoc(job.col, job.id))) return NextResponse.json({ error: "not_found", detail: "Esa búsqueda ya no existe." }, { status: 404 });
  if (!iaConfigurada()) return NextResponse.json({ error: "failed_precondition", detail: "Falta configurar la API de Claude (ANTHROPIC_API_KEY en Vercel)." }, { status: 409 });
  const hasta = Date.now() + 270_000;
  after(async () => {
    const r = await procesar(job, hasta);
    if (r === "sigue") await despertar({ job });
  });
  return NextResponse.json({ ok: true, job });
}
