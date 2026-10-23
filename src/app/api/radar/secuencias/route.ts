import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stepDays } from "@/lib/variants";

export const dynamic = "force-dynamic";

const CANAL: Record<string, string> = { EMAIL: "Email", WHATSAPP: "WhatsApp", TASK: "Tarea" };

/** Secuencias de Outreach para elegir desde el Radar (con cuántas empresas del Radar tiene cada una). */
export async function GET() {
  const [seqs, radar] = await Promise.all([
    db.sequence.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      include: { steps: { orderBy: { order: "asc" }, select: { type: true, delayDays: true } }, sender: { select: { name: true } } },
    }),
    db.enrollment.groupBy({ by: ["sequenceId"], where: { contact: { radarId: { not: null } }, status: { in: ["ACTIVE", "PAUSED"] } }, _count: true }),
  ]);
  const enRadar = new Map(radar.map((r) => [r.sequenceId, r._count]));
  return NextResponse.json({
    secuencias: seqs.map((sq) => {
      const days = stepDays(sq.steps);
      return {
        id: sq.id,
        nombre: sq.name,
        pasos: sq.steps.length,
        encendida: sq.sendingOn,
        estado: sq.status,
        remitente: sq.sender?.name ?? "",
        resumen: sq.steps.map((st, i) => `Día ${days[i]} · ${CANAL[st.type] ?? st.type}`).join(" → "),
        radar: enRadar.get(sq.id) ?? 0,
      };
    }),
  });
}
