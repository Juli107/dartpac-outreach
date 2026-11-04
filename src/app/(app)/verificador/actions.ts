"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { touchProspect } from "@/lib/radar/store";

/** Quita el email de un contacto de Outreach (sigue con su teléfono para WhatsApp y llamadas). */
export async function quitarEmailContacto(id: string) {
  const c = await db.contact.update({ where: { id }, data: { email: null, emailStatus: null, emailReason: null, emailSuggestion: null, emailCheckedAt: null } });
  // también en el Radar, si no, la copia del Radar le vuelve a poner el email
  if (c.radarId) await touchProspect(c.radarId, { tipo: "dato", texto: "Email descartado por inválido", por: "Verificador" }, { email: "", emailCheck: { __delete__: true } });
  revalidatePath("/verificador");
  revalidatePath("/contactos");
}

/**
 * Marca a mano si el contacto tiene WhatsApp («si»), si no tiene («no») o lo deja en automático (null). Se guarda
 * también en su empresa del Radar, así los dos lados muestran lo mismo.
 */
export async function marcarWa(id: string, marca: "si" | "no" | null) {
  const c = await db.contact.update({ where: { id }, data: { waMarca: marca } });
  if (c.radarId) {
    const texto = marca === "no" ? "Marcado: no tiene WhatsApp" : marca === "si" ? "Marcado: tiene WhatsApp" : "Marca de WhatsApp quitada";
    await touchProspect(c.radarId, { tipo: "dato", texto, por: "Verificador" }, { sinWa: marca === "no", conWa: marca === "si" });
  }
  revalidatePath("/verificador");
  revalidatePath("/contactos");
}
