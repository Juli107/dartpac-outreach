import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { senderConnected } from "@/lib/mailer";
import { quienSoy } from "@/lib/yo";

export const dynamic = "force-dynamic";

/** El equipo (remitentes) para elegir "quién sos" en el Radar, y quién entró con Google en este navegador. */
export async function GET() {
  const [senders, yo] = await Promise.all([db.sender.findMany({ orderBy: { name: "asc" } }), quienSoy()]);
  return NextResponse.json({
    remitentes: senders.map((s) => ({ id: s.id, nombre: s.name, email: s.email, conectado: senderConnected(s) })),
    yo: yo ? { senderId: yo.senderId ?? "", name: yo.name.split(/\s+/)[0], email: yo.email } : null,
  });
}
