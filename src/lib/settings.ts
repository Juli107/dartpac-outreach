import { db } from "./db";

/** Interruptor general de envíos; apagado si nadie lo ha encendido nunca. */
export async function sendingEnabled() {
  const s = await db.setting.findUnique({ where: { id: "app" } });
  return s?.sendingEnabled ?? false;
}

export async function setSendingEnabled(enabled: boolean) {
  await db.setting.upsert({
    where: { id: "app" },
    update: { sendingEnabled: enabled, sendingChangedAt: new Date() },
    create: { id: "app", sendingEnabled: enabled, sendingChangedAt: new Date() },
  });
}
