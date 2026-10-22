"use server";

import { revalidatePath } from "next/cache";
import { runDueSteps } from "@/lib/engine";
import { syncInbox } from "@/lib/inbox";
import { recordRun } from "@/lib/settings";
import { checkAllConnections } from "@/lib/health";

/** Procesa ahora lo pendiente; solo envía lo que ya enviaría el programador (secuencias encendidas y en horario). */
export async function runNow() {
  const inbox = await syncInbox().catch((e) => ({ error: String(e) }));
  const steps = await runDueSteps();
  await recordRun({ at: new Date().toISOString(), steps, inbox, source: "manual" });
  revalidatePath("/", "layout");
}

/** Comprueba la conexión SMTP de todos los buzones sin enviar nada. */
export async function checkConnections() {
  await checkAllConnections();
  revalidatePath("/", "layout");
}
