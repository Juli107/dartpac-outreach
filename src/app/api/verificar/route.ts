import { NextResponse } from "next/server";
import { z } from "zod";
import { verificarLista } from "@/lib/verifier";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ emails: z.array(z.string().max(320)).min(1).max(600), dns: z.boolean().optional() });

/** Verifica una tanda de direcciones (el navegador manda las listas largas de a tandas). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_argument" }, { status: 400 });
  const resultados = await verificarLista(parsed.data.emails, { dns: parsed.data.dns !== false, concurrency: 12 });
  return NextResponse.json({ resultados });
}
