import type { Usage } from "./claude";
import { getDoc, hoyAR, updateDoc } from "./store";

/** Gasto estimado de la API de Claude por día (config/uso), para mostrarlo y no pasar el tope diario. */
export async function sumarUsoDia(u: Usage) {
  if (!u.usd && !u.tokIn && !u.tokOut) return;
  const dia = hoyAR();
  await updateDoc(
    "config",
    "uso",
    (d) => {
      const hoy = d.dia === dia ? d : { dia, usd: 0, busquedas: 0, tokens: 0 };
      return {
        ...d,
        dia,
        usd: +(Number(hoy.usd ?? 0) + u.usd).toFixed(4),
        busquedas: Number(hoy.busquedas ?? 0) + u.busq,
        tokens: Number(hoy.tokens ?? 0) + u.tokIn + u.tokOut + u.cacheR + u.cacheW,
        historico: +(Number(d.historico ?? 0) + u.usd).toFixed(4),
      };
    },
    { create: true },
  );
}

export const sumarUsoIa = sumarUsoDia;

export function topeDiario() {
  return Number(process.env.RADAR_DAILY_USD ?? 25);
}

export async function topeDiarioSuperado() {
  const u = await getDoc("config", "uso");
  return !!u && u.data.dia === hoyAR() && Number(u.data.usd ?? 0) >= topeDiario();
}

export async function usoDeHoy() {
  const u = await getDoc("config", "uso");
  const hoy = !!u && u.data.dia === hoyAR();
  return { usd: hoy ? Number(u!.data.usd ?? 0) : 0, busquedas: hoy ? Number(u!.data.busquedas ?? 0) : 0, historico: Number(u?.data.historico ?? 0), tope: topeDiario() };
}
