"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { camposContacto, verificar, verificarLocal } from "@/lib/verifier";
import { touchProspect, getDoc } from "@/lib/radar/store";

/** Corrige el email de una empresa del Radar con la sugerencia del verificador. */
export async function corregirRadar(id: string) {
  const doc = await getDoc("prospectos", id);
  const email = typeof doc?.data.email === "string" ? doc.data.email : "";
  if (!email) return;
  const r = verificarLocal(email);
  if (r.estado !== "corregible" || !r.sugerencia) return;
  const r2 = await verificar(r.sugerencia);
  await touchProspect(
    id,
    { tipo: "dato", texto: `Email corregido: ${email} → ${r.sugerencia}`, por: "Verificador" },
    { email: r.sugerencia, emailCheck: { estado: r2.estado, motivos: r2.motivos.map((m) => m.k), sugerencia: r2.sugerencia, t: Date.now(), v: 1 } },
  );
  await db.contact.updateMany({ where: { radarId: id }, data: { email: r.sugerencia, ...camposContacto(r2) } }).catch(() => null);
  revalidatePath("/verificador");
}

/** Aparta el email inválido de una empresa del Radar (queda en el historial; la empresa sigue con su teléfono). */
export async function quitarEmailRadar(id: string) {
  const doc = await getDoc("prospectos", id);
  const email = typeof doc?.data.email === "string" ? doc.data.email : "";
  if (!email) return;
  await touchProspect(id, { tipo: "dato", texto: `Email descartado por inválido: ${email}`, por: "Verificador" }, { email: "", emailCheck: { __delete__: true } });
  revalidatePath("/verificador");
}

/** Quita el email de un contacto de Outreach (sigue con su teléfono para WhatsApp y llamadas). */
export async function quitarEmailContacto(id: string) {
  await db.contact.update({ where: { id }, data: { email: null, emailStatus: null, emailReason: null, emailSuggestion: null, emailCheckedAt: null } });
  revalidatePath("/verificador");
  revalidatePath("/contactos");
}
