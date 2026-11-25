import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { firmaSistemaOk, TAG_REACTIVAR } from "@/lib/firma-sistema";
import { nextSendTime, windowFor } from "@/lib/schedule";
import { waNum } from "@/lib/whatsapp";
import { registrar } from "@/lib/actividad";

export const dynamic = "force-dynamic";


const Cli = z.object({
  id: z.string().min(1).max(200),
  nombre: z.string().max(200).default(""),
  contacto: z.string().max(120).default(""),
  email: z.string().max(200).default(""),
  telefono: z.string().max(80).default(""),
  localidad: z.string().max(120).default(""),
  provincia: z.string().max(120).default(""),
});
const Body = z.object({ accion: z.enum(["secuencias", "sumar"]), sequenceId: z.string().optional(), por: z.string().max(80).default("DARTPAC SISTEMA"), clientes: z.array(Cli).max(300).default([]) });

/**
 * Desde DARTPAC SISTEMA («Clientes que dejaron de comprar»):
 *  - accion "secuencias": las secuencias activas o en pausa, para elegir una de reactivación.
 *  - accion "sumar": crea o actualiza el contacto de cada cliente (marcado «reactivacion» y etapa Cliente) y lo suma a la
 *    secuencia. Las bajas y los rebotes no se tocan.
 */
export async function POST(req: Request) {
  const cuerpo = await req.text();
  if (!(await firmaSistemaOk(req, cuerpo))) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let parsed;
  try {
    parsed = Body.safeParse(JSON.parse(cuerpo));
  } catch {
    return NextResponse.json({ error: "invalid_argument" }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "invalid_argument" }, { status: 400 });
  const b = parsed.data;

  if (b.accion === "secuencias") {
    const L = await db.sequence.findMany({
      where: { status: { in: ["ACTIVE", "PAUSED", "DRAFT"] } },
      select: { id: true, name: true, status: true, sendingOn: true, sender: { select: { name: true } }, _count: { select: { steps: true, enrollments: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({
      secuencias: L.map((s) => ({ id: s.id, nombre: s.name, estado: s.status, enviando: s.sendingOn, remitente: s.sender?.name ?? "", pasos: s._count.steps, personas: s._count.enrollments })),
    });
  }

  const seq = await db.sequence.findUnique({ where: { id: b.sequenceId ?? "" }, include: { steps: { orderBy: { order: "asc" }, select: { order: true, delayDays: true } } } });
  if (!seq || seq.status === "ARCHIVED") return NextResponse.json({ error: "not_found", detail: "Esa secuencia ya no existe." }, { status: 404 });
  const first = seq.steps[0];
  if (!first) return NextResponse.json({ error: "failed_precondition", detail: "La secuencia no tiene pasos todavía." }, { status: 409 });
  const runAt = nextSendTime(new Date(), first.delayDays, windowFor(seq));
  const r = { sumados: 0, yaEstaban: 0, bajas: 0, sinCanal: 0 };
  for (const c of b.clientes) {
    const email = c.email.trim().toLowerCase();
    const okMail = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email);
    const tel = waNum(c.telefono) ? c.telefono : "";
    if (!okMail && !tel) { r.sinCanal++; continue; }
    let contact = okMail ? await db.contact.findUnique({ where: { email } }) : null;
    if (!contact && tel) contact = await db.contact.findFirst({ where: { OR: [{ phone: c.telefono }, { whatsapp: c.telefono }] } });
    if (contact && (contact.unsubscribed || contact.bounced)) { r.bajas++; continue; }
    const [nom, ...ape] = c.contacto.trim().split(/\s+/);
    if (contact) {
      contact = await db.contact.update({
        where: { id: contact.id },
        data: { company: contact.company ?? (c.nombre || null), phone: contact.phone ?? (tel || null), etapa: "cliente", tags: [...new Set([...contact.tags, TAG_REACTIVAR, "cliente-sistema"])] },
      });
    } else {
      contact = await db.contact.create({
        data: {
          email: okMail ? email : null,
          firstName: nom || null,
          lastName: ape.join(" ") || null,
          company: c.nombre || null,
          phone: tel || null,
          city: c.localidad || null,
          province: c.provincia || null,
          etapa: "cliente",
          tags: [TAG_REACTIVAR, "cliente-sistema"],
        },
      });
    }
    const ya = await db.enrollment.findUnique({ where: { sequenceId_contactId: { sequenceId: seq.id, contactId: contact.id } }, select: { id: true } });
    if (ya) { r.yaEstaban++; continue; }
    await db.enrollment.create({ data: { sequenceId: seq.id, contactId: contact.id, nextStep: first.order, nextRunAt: runAt } });
    r.sumados++;
  }
  if (r.sumados) await registrar({ name: b.por, senderId: null }, "secuencia", `Sumó ${r.sumados} cliente${r.sumados === 1 ? "" : "s"} del sistema a «${seq.name}» para reactivarlos`).catch(() => null);
  return NextResponse.json({ ok: true, secuencia: seq.name, enviando: seq.sendingOn && seq.status === "ACTIVE", ...r });
}
