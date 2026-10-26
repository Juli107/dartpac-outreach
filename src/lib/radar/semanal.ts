import { DEPS, depDeP, depDoc, FUENTES_DEF, habitantes, provNom, rubrosProv } from "./geo";
import { getDoc, hoyAR, listCol, setDoc, updateDoc } from "./store";
import { iaConfigurada } from "./claude";
import type { Job } from "./worker";

/** Con menos empresas que esto el Radar todavía no tiene su base: buscar ahí repetiría las que se van a subir. */
const BASE_MINIMA = 50;

export type Semanal = { ok: boolean; omitida?: string; motivo?: string; busquedas?: number; zonas?: string[]; jobs: Job[] };

/**
 * Búsqueda automática de los lunes: elige los partidos y departamentos con más habitantes y menos prospectos
 * (sin repetir los recorridos en las últimas semanas) y arma una búsqueda por provincia. Corre una sola vez por día:
 * si la piden a la vez el programador externo, GitHub y la app, gana uno solo.
 */
export async function armarSemanal(opts: { forzar?: boolean } = {}): Promise<Semanal> {
  if (!iaConfigurada()) return { ok: false, motivo: "Falta ANTHROPIC_API_KEY", jobs: [] };
  const marca = await getDoc("config", "semanal");
  if (!opts.forzar && marca?.data.ultima === hoyAR()) return { ok: true, omitida: "ya corrió hoy", jobs: [] };

  const [prospectos, busquedas] = await Promise.all([listCol("prospectos"), listCol("busquedas")]);
  if (prospectos.length < BASE_MINIMA) return { ok: true, omitida: "la base del Radar está vacía: primero hay que subir radar-dartpac.json", jobs: [] };

  // Se reserva el día antes de armar nada.
  try {
    await updateDoc("config", "semanal", { ultima: hoyAR(), reservada: Date.now() }, { create: true, ifVersion: marca?.v ?? 0 });
  } catch {
    return { ok: true, omitida: "otra llamada ya la está armando", jobs: [] };
  }

  const cuantos = Math.max(1, Math.min(30, Number(process.env.RADAR_SEMANAL_DEPS ?? 12)));
  const porDep = new Map<number, number>();
  for (const { data } of prospectos) {
    const d = depDeP(data);
    if (d >= 0) porDep.set(d, (porDep.get(d) ?? 0) + 1);
  }
  const hace8 = Date.now() - 56 * 86400_000;
  const recientes = new Set(
    busquedas
      .filter((b) => Number(b.data.t ?? 0) > hace8)
      .flatMap((b) => [...((b.data.hechos as string[]) ?? []), ...(((b.data.deps as { c?: string }[]) ?? []).map((d) => d.c ?? ""))])
      .filter(Boolean),
  );
  const elegidos = DEPS.map((d) => ({ d, hab: habitantes(d.i), n: porDep.get(d.i) ?? 0 }))
    .filter((x) => x.hab >= 20_000 && !recientes.has(x.d.c))
    .sort((a, b) => b.hab / (1 + 3 * b.n) - a.hab / (1 + 3 * a.n))
    .slice(0, cuantos);
  if (!elegidos.length) return { ok: true, omitida: "no hay zonas para recorrer", jobs: [] };

  const porProv = new Map<string, number[]>();
  for (const x of elegidos) porProv.set(x.d.prov, [...(porProv.get(x.d.prov) ?? []), x.d.i]);
  const grupo = "auto" + Date.now().toString(36);
  const t = Date.now();
  const partes: { pv: string; deps: number[] }[] = [];
  for (const [pv, ids] of porProv) for (let k = 0; k < ids.length; k += 4) partes.push({ pv, deps: ids.slice(k, k + 4) });
  const jobs: Job[] = [];
  for (const [k, pt] of partes.entries()) {
    const id = `${grupo}-${k + 1}`;
    await setDoc("busquedas", id, {
      provincia: pt.pv,
      rubros: rubrosProv(pt.pv).slice(0, 6),
      fuentes: FUENTES_DEF,
      nota: "Búsqueda automática de los lunes: zonas con muchos habitantes y pocos prospectos.",
      estado: "pendiente",
      t,
      grupo,
      parte: k + 1,
      partes: partes.length,
      por: "Automática",
      zona: { tipo: "auto", nombre: `Automática · ${pt.deps.length === 1 ? DEPS[pt.deps[0]].n : `${pt.deps.length} zonas de ${provNom(pt.pv)}`}` },
      deps: pt.deps.map(depDoc),
    });
    jobs.push({ col: "busquedas", id });
  }
  await updateDoc("config", "semanal", { ultima: hoyAR(), grupo, zonas: elegidos.map((x) => x.d.n) }, { create: true });
  return { ok: true, busquedas: jobs.length, zonas: elegidos.map((x) => `${x.d.n} (${provNom(x.d.prov)})`), jobs };
}

/** Lunes desde las 8:47 de Buenos Aires (11:47 UTC). */
export function esHoraSemanal(now = new Date()) {
  return now.getUTCDay() === 1 && now.getUTCHours() * 60 + now.getUTCMinutes() >= 11 * 60 + 47;
}
