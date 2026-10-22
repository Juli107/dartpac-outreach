import type { Prisma } from "@prisma/client";
import { db } from "./db";

/** Resultado de una pasada del programador: envíos y lectura de buzones. */
export type RunReport = {
  at: string;
  steps: { sent: number; tasks: number; finished: number; errors: number; sequencesOn: number; outsideWindow: number };
  inbox: { imported: number; bounced?: number; errors?: string[]; disabled?: boolean } | "omitida" | { error: string };
  source: "cron" | "manual";
};

export async function recordRun(report: RunReport) {
  const at = new Date(report.at);
  const lastRun = report as unknown as Prisma.InputJsonValue;
  await db.setting.upsert({
    where: { id: "app" },
    update: { lastRunAt: at, lastRun },
    create: { id: "app", lastRunAt: at, lastRun },
  });
}

export async function lastRun() {
  const s = await db.setting.findUnique({ where: { id: "app" } });
  return { at: s?.lastRunAt ?? null, report: (s?.lastRun ?? null) as RunReport | null };
}

/** Guarda el resultado de comprobar el buzón general (sus credenciales viven en el .env, no en la tabla de remitentes). */
export async function recordGeneralCheck(error: string | null) {
  const data = { generalCheckAt: new Date(), generalCheckError: error };
  await db.setting.upsert({ where: { id: "app" }, update: data, create: { id: "app", ...data } });
}
