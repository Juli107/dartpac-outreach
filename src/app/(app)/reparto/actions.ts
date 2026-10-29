"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { usuarioActual } from "@/lib/usuario";
import { asegurarSecuencias, repartir, REPARTO } from "@/lib/reparto";
import { registrarYo } from "@/lib/actividad";

/** El reparto lo maneja solo el administrador. */
async function soloAdmin() {
  const u = await usuarioActual();
  if (!u.admin) throw new Error("Solo el administrador puede cambiar el reparto.");
  return u;
}

/** Enciende o apaga el reparto automático de las 8. No enciende ninguna secuencia. */
export async function toggleReparto(on: boolean) {
  await soloAdmin();
  await db.setting.upsert({ where: { id: "app" }, update: { repartoOn: on }, create: { id: "app", repartoOn: on } });
  await registrarYo("reparto", on ? "Encendió el reparto diario de las 8." : "Apagó el reparto diario.");
  revalidatePath("/reparto");
}

/**
 * Suma o saca a un remitente del reparto. Al sumarlo se le arman sus dos secuencias (apagadas) y, si todavía tiene
 * los topes de fábrica, pasan a 100 mails y 40 WhatsApp por día.
 */
export async function toggleRemitente(id: string, on: boolean) {
  await soloAdmin();
  const s = await db.sender.findUniqueOrThrow({ where: { id } });
  await db.sender.update({
    where: { id },
    data: {
      repartoOn: on,
      ...(on && s.dailyLimit === 50 ? { dailyLimit: REPARTO.mails } : {}),
      ...(on && s.waDailyLimit === 20 ? { waDailyLimit: REPARTO.whatsapp } : {}),
    },
  });
  if (on) await asegurarSecuencias(id);
  revalidatePath("/reparto");
}

const topes = z.object({
  repartoDia: z.coerce.number().int().min(0).max(500),
  dailyLimit: z.coerce.number().int().min(1).max(500),
  waDailyLimit: z.coerce.number().int().min(0).max(500),
});

export async function guardarTopes(id: string, form: FormData) {
  await soloAdmin();
  const d = topes.parse(Object.fromEntries(form));
  const s = await db.sender.update({ where: { id }, data: d });
  // la secuencia de mails no frena antes que el buzón
  if (s.seqMailId) await db.sequence.updateMany({ where: { id: s.seqMailId }, data: { dailyLimit: d.dailyLimit } });
  revalidatePath("/reparto");
}

/** Reparte ahora lo que falte del día (nunca pasa del cupo diario de cada remitente). No envía nada. */
export async function repartirAhora() {
  const u = await soloAdmin();
  await repartir(new Date(), u);
  revalidatePath("/reparto");
}
