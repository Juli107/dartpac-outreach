"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { usuarioActual } from "@/lib/usuario";
import { registrarYo } from "@/lib/actividad";
import { mandarResumen } from "@/lib/resumen-diario";

async function soloAdmin() {
  const u = await usuarioActual();
  if (!u.admin) throw new Error("Solo el administrador maneja el resumen diario.");
}

/** Enciende o apaga el resumen diario de las 19 h. */
export async function toggleResumen(on: boolean) {
  await soloAdmin();
  await db.setting.upsert({ where: { id: "app" }, update: { resumenOn: on }, create: { id: "app", resumenOn: on } });
  await registrarYo("reparto", on ? "Encendió el resumen diario de las 19 h." : "Apagó el resumen diario.");
  revalidatePath("/envios");
}

/** Manda el resumen de hoy ahora mismo, al administrador (lo pide él con el botón). */
export async function probarResumen(): Promise<{ ok: boolean; msg: string }> {
  await soloAdmin();
  try {
    const r = await mandarResumen();
    return r.ok ? { ok: true, msg: `Listo: te llegó a ${r.para}.` } : { ok: false, msg: r.error };
  } catch (e) {
    return { ok: false, msg: `No salió: ${e instanceof Error ? e.message : String(e)}` };
  }
}
