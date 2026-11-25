import { NextResponse } from "next/server";
import { z } from "zod";
import { getDoc, setDoc } from "@/lib/radar/store";
import { altaEnSistema, SISTEMA_URL } from "@/lib/sistema";
import { quienSoy } from "@/lib/yo";

export const dynamic = "force-dynamic";

const Body = z.object({ id: z.string().min(1).max(200), vendedor: z.string().max(80).optional() });

/**
 * El prospecto compró: lo da de alta como cliente en DARTPAC SISTEMA (o lo vincula si ya estaba) y deja en su ficha
 * del Radar el id del cliente, para cotizarle y seguir sus compras desde el sistema.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_argument" }, { status: 400 });
  const d = await getDoc("prospectos", parsed.data.id);
  if (!d) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const yo = await quienSoy().catch(() => null);
    const vendedor = (parsed.data.vendedor || String(d.data.asignado || "") || yo?.name || "").trim();
    const r = await altaEnSistema({ ...d.data, id: parsed.data.id }, vendedor);
    const alta = { estado: "hecha", sisId: r.id, nuevo: r.nuevo, t: Date.now(), por: yo?.name || "Outreach" };
    const h = Array.isArray(d.data.historial) ? d.data.historial : [];
    await setDoc("prospectos", parsed.data.id, {
      ...d.data,
      alta,
      actualizado: Date.now(),
      historial: [...h, { t: Date.now(), tipo: "alta", texto: r.nuevo ? "Dado de alta como cliente en DARTPAC SISTEMA" : `Vinculado al cliente «${r.nombre}» que ya estaba en DARTPAC SISTEMA`, por: yo?.name || "Outreach" }],
    });
    return NextResponse.json({ ok: true, ...r, alta, url: `${SISTEMA_URL}/?cliente=${encodeURIComponent(r.id)}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "failed_precondition", detail: msg.includes("sis_docs") ? "DARTPAC SISTEMA no está disponible en esta base." : msg }, { status: 409 });
  }
}
