import { getDoc, updateDoc } from "@/lib/radar/store";

/**
 * Turno exclusivo guardado en la base (config/<nombre>): si dos programadores llaman a la vez
 * (cron-job.org y el workflow de GitHub), trabaja uno solo y el otro se saltea, así nunca sale dos veces el mismo paso.
 * Devuelve la función para soltar el turno, o null si lo tiene otro.
 */
export async function tomarTurno(nombre: string, ms: number): Promise<(() => Promise<void>) | null> {
  const ahora = Date.now();
  const cur = await getDoc("config", nombre).catch(() => null);
  if (cur && Number(cur.data.hasta ?? 0) > ahora) return null;
  try {
    // ifVersion: si otro lo tomó entre la lectura y la escritura (o lo creó primero), esta escritura falla.
    const v = await updateDoc("config", nombre, { hasta: ahora + ms, desde: ahora }, { create: true, ifVersion: cur?.v ?? 0 });
    return async () => {
      await updateDoc("config", nombre, { hasta: 0 }, { ifVersion: v ?? undefined }).catch(() => undefined);
    };
  } catch {
    return null;
  }
}
