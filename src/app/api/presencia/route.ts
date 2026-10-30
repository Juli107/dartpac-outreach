import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { usuarioActual } from "@/lib/usuario";

export const dynamic = "force-dynamic";

/** Cada cuánto, como mucho, se anota en la base: la pestaña avisa cada minuto. */
const CADA_MS = 30_000;

/** La pestaña abierta avisa que el usuario sigue conectado. Con la contraseña común se anota como «Administrador». */
export async function POST() {
  const u = await usuarioActual();
  const ahora = new Date();
  const antes = new Date(ahora.getTime() - CADA_MS);
  if (u.senderId) {
    await db.sender.updateMany({ where: { id: u.senderId, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: antes } }] }, data: { lastSeenAt: ahora } });
  } else if (!u.email) {
    await db.setting.upsert({ where: { id: "app" }, create: { id: "app", adminSeenAt: ahora }, update: { adminSeenAt: ahora } });
  }
  return new NextResponse(null, { status: 204 });
}
