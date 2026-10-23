import { db } from "./db";
import { overallHealth } from "./health";
import { hoyAR, listCol, radarHoyCount, type RadarData } from "./radar/store";
import { provNom } from "./radar/geo";
import { fullName } from "./labels";

/** Un aviso de la campanita. `n` > 0 cuenta como "sin leer" hasta que se abre (o hasta que crece). */
export type Notif = {
  id: string;
  g: "curso" | "hoy" | "nov" | "base";
  ic: string;
  tono?: "ok" | "warn" | "bad" | "info" | "hot";
  n: number;
  t: string;
  d?: string;
  href?: string;
  ir?: Record<string, unknown>;
  cuando?: number;
};

const pl = (n: number, a: string, b: string) => (n === 1 ? a : b);
const s = (v: unknown) => (typeof v === "string" ? v : "");

export async function notificaciones(): Promise<{ L: Notif[]; hoy: number }> {
  const H = hoyAR();
  const L: Notif[] = [];
  const hace36 = Date.now() - 36 * 3600_000;

  const [unread, ultimas, tareas, salud, malos, radarHoy, busquedas, alertas, pedidos] = await Promise.all([
    db.reply.count({ where: { read: false } }),
    db.reply.findMany({ where: { read: false }, orderBy: { receivedAt: "desc" }, take: 3, include: { contact: true } }),
    db.task.groupBy({ by: ["kind"], where: { done: false }, _count: true }),
    overallHealth().catch(() => null),
    db.contact.count({ where: { emailStatus: { in: ["invalido", "corregible"] }, unsubscribed: false, enrollments: { some: { status: { in: ["ACTIVE", "PAUSED"] } } } } }),
    radarHoyCount().catch(() => 0),
    listCol("busquedas").catch(() => []),
    listCol("alertas").catch(() => []),
    listCol("pedidos").catch(() => []),
  ]);

  // Outreach
  if (unread) {
    L.push({
      id: `resp-${ultimas[0]?.id ?? H}`,
      g: "nov",
      ic: "💬",
      tono: "ok",
      n: unread,
      t: `${unread} ${pl(unread, "respuesta sin leer", "respuestas sin leer")}`,
      d: ultimas.map((r) => fullName(r.contact)).join(" · "),
      href: "/bandeja",
      cuando: ultimas[0]?.receivedAt.getTime(),
    });
  }
  const wa = tareas.find((t) => t.kind === "WHATSAPP")?._count ?? 0;
  const otras = tareas.filter((t) => t.kind !== "WHATSAPP").reduce((a, t) => a + t._count, 0);
  if (wa + otras) {
    L.push({
      id: `tareas-${H}`,
      g: "hoy",
      ic: "✅",
      n: wa + otras,
      t: `${wa + otras} ${pl(wa + otras, "tarea de las secuencias", "tareas de las secuencias")}`,
      d: [wa ? `${wa} WhatsApp listo${wa === 1 ? "" : "s"} para mandar` : "", otras ? `${otras} ${pl(otras, "llamada o tarea", "llamadas o tareas")}` : ""].filter(Boolean).join(" · "),
      href: "/tareas",
    });
  }
  if (salud && (salud.level === "bad" || salud.level === "warn")) {
    const bad = salud.level === "bad";
    const first = [...salud.scheduler, ...salud.on.flatMap((q) => salud.bySequence.get(q.id) ?? []), ...salud.boxes.flatMap((b) => b.checks)].find((c) => c.level === salud.level);
    L.push({ id: `salud-${salud.level}-${H}`, g: bad ? "hoy" : "base", ic: bad ? "⛔" : "⚠️", tono: bad ? "bad" : "warn", n: 1, t: bad ? "Hay envíos frenados" : "Algo para revisar en los envíos", d: first?.title, href: "/buzones#salud" });
  }
  if (malos) L.push({ id: `vfy-${H}`, g: "base", ic: "✉️", tono: "warn", n: malos, t: `${malos} ${pl(malos, "correo con problemas", "correos con problemas")} en secuencias activas`, d: "Corregí los tipeos y apartá los inválidos antes de que reboten.", href: "/verificador" });

  // Radar
  if (radarHoy) L.push({ id: `radar-hoy-${H}`, g: "hoy", ic: "📋", n: radarHoy, t: `${radarHoy} ${pl(radarHoy, "empresa para contactar hoy", "empresas para contactar hoy")}`, d: "Seguimientos del Radar comercial.", href: "/radar", ir: { tab: "hoy" } });
  const vivas = busquedas.filter((b) => (b.data.estado === "pendiente" || b.data.estado === "buscando") && Date.now() - Number(b.data.latido ?? b.data.inicio ?? b.data.t ?? 0) < 30 * 60_000);
  for (const pv of [...new Set(vivas.map((b) => s(b.data.provincia)))]) {
    const v = vivas.find((b) => b.data.provincia === pv)!;
    L.push({ id: `busv-${pv}`, g: "curso", ic: "⏳", n: 0, t: `Buscando clientes en ${provNom(pv)}…`, d: s(v.data.progreso) || "Claude revisa y verifica cada empresa.", href: "/radar", ir: { prov: pv } });
  }
  const grupos = new Map<string, RadarData[]>();
  for (const b of busquedas) {
    const g = s(b.data.grupo) || b.id;
    grupos.set(g, [...(grupos.get(g) ?? []), b.data]);
  }
  for (const [g, G] of grupos) {
    const fin = Math.max(...G.map((x) => Number(x.fin ?? 0)));
    if (fin < hace36 || G.some((x) => x.estado === "pendiente" || x.estado === "buscando") || !G.some((x) => x.estado === "hecha")) continue;
    const tot = G.reduce((a, x) => a + (Number(x.encontrados) || 0), 0);
    const pv = s(G[0].provincia);
    L.push({ id: `bus-${g}`, g: "nov", ic: "📡", tono: "ok", n: 1, t: G.length === 1 && s(G[0].resultado) ? s(G[0].resultado) : `${tot} ${pl(tot, "empresa nueva", "empresas nuevas")} en ${provNom(pv)}`, d: "Búsqueda terminada. Ya están en el mapa y en «Hoy».", cuando: fin, href: "/radar", ir: { prov: pv } });
  }
  alertas
    .filter((a) => a.data.estado === "nueva")
    .sort((a, b) => Number(b.data.t ?? 0) - Number(a.data.t ?? 0))
    .slice(0, 8)
    .forEach((a) => L.push({ id: `ala-${a.id}`, g: "nov", ic: "🔔", tono: "info", n: 1, t: s(a.data.titulo) || "Oportunidad nueva", d: s(a.data.detalle), cuando: Number(a.data.t ?? 0), href: "/radar", ir: { ax: "alertas" } }));
  pedidos
    .filter((x) => x.data.estado === "hecha" && s(x.data.resultado) && Number(x.data.fin ?? x.data.t ?? 0) > hace36)
    .forEach((x) => L.push({ id: `ped-${x.id}`, g: "nov", ic: "✅", tono: "ok", n: 1, t: s(x.data.resultado), d: "Pedido al asistente terminado.", cuando: Number(x.data.fin ?? 0), href: "/radar", ir: { tab: "auto" } }));

  return { L, hoy: L.filter((x) => x.g === "hoy").reduce((a, x) => a + x.n, 0) };
}
