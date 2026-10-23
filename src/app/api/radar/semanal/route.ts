import { NextResponse, after } from "next/server";
import { autorizadoCron } from "@/lib/cron-auth";
import { DEPS, depDeP, depDoc, FUENTES_DEF, habitantes, provNom, rubrosProv } from "@/lib/radar/geo";
import { getDoc, hoyAR, listCol, setDoc, updateDoc } from "@/lib/radar/store";
import { despertar, procesar } from "@/lib/radar/worker";
import { iaConfigurada } from "@/lib/radar/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Búsqueda automática de los lunes: elige los partidos y departamentos con más habitantes y menos prospectos
 * (sin repetir los recorridos en las últimas semanas) y lanza una búsqueda por provincia.
 */
export async function POST(req: Request) {
  if (!(await autorizadoCron(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!iaConfigurada()) return NextResponse.json({ ok: false, motivo: "Falta ANTHROPIC_API_KEY" });
  const forzar = new URL(req.url).searchParams.has("forzar");
  const marca = await getDoc("config", "semanal");
  if (!forzar && marca?.data.ultima === hoyAR()) return NextResponse.json({ ok: true, omitida: "ya corrió hoy" });

  const cuantos = Math.max(1, Math.min(30, Number(process.env.RADAR_SEMANAL_DEPS ?? 12)));
  const [prospectos, busquedas] = await Promise.all([listCol("prospectos"), listCol("busquedas")]);
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
  if (!elegidos.length) return NextResponse.json({ ok: true, omitida: "no hay zonas para recorrer" });

  const porProv = new Map<string, number[]>();
  for (const x of elegidos) porProv.set(x.d.prov, [...(porProv.get(x.d.prov) ?? []), x.d.i]);
  const grupo = "auto" + Date.now().toString(36);
  const t = Date.now();
  const partes: { pv: string; deps: number[] }[] = [];
  for (const [pv, ids] of porProv) for (let k = 0; k < ids.length; k += 4) partes.push({ pv, deps: ids.slice(k, k + 4) });
  const jobs: { col: "busquedas"; id: string }[] = [];
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
  const hasta = Date.now() + 270_000;
  const [primero, ...resto] = jobs;
  after(async () => {
    for (const j of resto) await despertar({ job: j });
    const r = await procesar(primero, hasta);
    if (r === "sigue") await despertar({ job: primero });
  });
  return NextResponse.json({ ok: true, busquedas: jobs.length, zonas: elegidos.map((x) => `${x.d.n} (${provNom(x.d.prov)})`) });
}

export const GET = POST;
