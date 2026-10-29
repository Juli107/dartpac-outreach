import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatDate, relativeTime } from "@/lib/labels";
import { todayStart } from "@/lib/quota";
import { asignarDuenosPendientes } from "@/lib/dueno";
import { primerNombre, usuarioActual } from "@/lib/usuario";
import { TIPOS_ACTIVIDAD } from "@/lib/actividad";
import { PageHeader, Empty, Segmented, Pill, Avatar } from "@/components/ui";

export const metadata = { title: "Equipo" };

const TONO: Record<string, "ok" | "warn" | "bad" | "info" | "neutral"> = {
  busqueda: "info",
  mensaje: "ok",
  mail: "ok",
  whatsapp: "ok",
  secuencia: "info",
  bloqueo: "bad",
  asigno: "warn",
};

/**
 * Cada usuario con sus clientes, sus secciones (una por búsqueda: «Córdoba – Luis Mendieta») y todo lo que hizo:
 * entradas, búsquedas, mensajes, envíos de sus secuencias, contactos sumados y bloqueos. El administrador ve a todos;
 * cada vendedor se ve a sí mismo.
 */
export default async function Equipo({ searchParams }: { searchParams: Promise<{ quien?: string; tipo?: string }> }) {
  const sp = await searchParams;
  await asignarDuenosPendientes();
  const u = await usuarioActual();
  const [senders, setting] = await Promise.all([
    db.sender.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true, lastSeenAt: true } }),
    db.setting.findUnique({ where: { id: "app" }, select: { adminSeenAt: true } }),
  ]);
  const visibles = u.admin ? senders : senders.filter((x) => x.id === u.senderId);
  const quien = u.admin ? (sp.quien ?? "") : (u.senderId ?? "-");
  const tipo = sp.tipo && TIPOS_ACTIVIDAD[sp.tipo] ? sp.tipo : "";
  const hoy = todayStart();

  const whereAct: Prisma.ActividadWhereInput = {
    ...(quien === "admin" ? { senderId: null } : quien ? { senderId: quien } : {}),
    ...(tipo ? { tipo } : {}),
  };
  const [clientes, secciones, hoyPorTipo, ultima, actividad, libres] = await Promise.all([
    db.contact.groupBy({ by: ["ownerId"], where: { ownerId: { in: visibles.map((x) => x.id) } }, _count: { _all: true } }),
    db.contact.groupBy({ by: ["ownerId", "seccion"], where: { ownerId: { in: visibles.map((x) => x.id) }, seccion: { not: null } }, _count: { _all: true }, orderBy: { seccion: "asc" } }),
    db.actividad.groupBy({ by: ["senderId", "tipo"], where: { at: { gte: hoy }, senderId: { in: visibles.map((x) => x.id) } }, _count: { _all: true } }),
    db.actividad.groupBy({ by: ["senderId"], where: { senderId: { in: visibles.map((x) => x.id) } }, _max: { at: true } }),
    db.actividad.findMany({ where: whereAct, orderBy: { at: "desc" }, take: 200 }),
    u.admin ? db.contact.count({ where: { ownerId: null } }) : Promise.resolve(0),
  ]);
  const n = (sid: string, t: string[]) => hoyPorTipo.filter((x) => x.senderId === sid && t.includes(x.tipo)).reduce((a, x) => a + x._count._all, 0);
  const qs = (o: Record<string, string>) => {
    const x: Record<string, string> = { ...(quien && u.admin ? { quien } : {}), ...(tipo ? { tipo } : {}), ...o };
    for (const k of Object.keys(x)) if (!x[k]) delete x[k];
    return `/equipo?${new URLSearchParams(x)}`;
  };

  // quién tiene la app abierta: la pestaña avisa cada minuto, así que más de 3 minutos sin aviso es «desconectado»
  const conectado = (d: Date | null | undefined) => !!d && Date.now() - d.getTime() < 3 * 60_000;
  const presencia = [
    ...visibles.map((x) => ({ id: x.id, name: x.name, sub: x.email, visto: x.lastSeenAt })),
    ...(u.admin ? [{ id: "admin", name: "Administrador", sub: "Entró con la contraseña común", visto: setting?.adminSeenAt ?? null }] : []),
  ].sort((a, b) => (b.visto?.getTime() ?? 0) - (a.visto?.getTime() ?? 0));
  const enLinea = presencia.filter((p) => conectado(p.visto)).length;

  // la actividad, agrupada por día
  const dias: { dia: string; items: typeof actividad }[] = [];
  for (const a of actividad) {
    const dia = a.at.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: process.env.SEND_TIMEZONE ?? "America/Argentina/Buenos_Aires" });
    const g = dias.find((d) => d.dia === dia);
    if (g) g.items.push(a);
    else dias.push({ dia, items: [a] });
  }

  return (
    <>
      <PageHeader
        title="Equipo"
        sub={u.admin ? "Los clientes de cada vendedor, sus secciones y todo lo que hace cada uno." : "Tus clientes, tus secciones y todo lo que hiciste."}
      >
        <Link href="/contactos" className="btn-ghost">Ver contactos</Link>
        <a href="/login/salir" className="btn-ghost">Salir ({primerNombre(u.name)})</a>
      </PageHeader>

      <section className="card appear flex flex-col gap-3 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-semibold text-white">Usuarios conectados</p>
          <span className="text-xs text-muted">{enLinea === 0 ? "Nadie conectado ahora" : `${enLinea} conectado${enLinea === 1 ? "" : "s"} ahora`}</span>
        </div>
        <ul className="divide-y divide-line/40">
          {presencia.map((p) => {
            const on = conectado(p.visto);
            return (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="relative">
                  <Avatar name={p.name} size={32} />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[#0B2545] ${on ? "bg-emerald-400" : "bg-white/25"}`}
                    aria-hidden
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-white">{p.name}</span>
                  <span className="block truncate text-[11px] text-faint">{p.sub}</span>
                </span>
                <span className="text-right text-xs">
                  {on ? (
                    <Pill tone="ok">Conectado ahora</Pill>
                  ) : p.visto ? (
                    <>
                      <span className="block text-ink/90">Última vez {relativeTime(p.visto)}</span>
                      <span className="block text-[11px] text-faint">{formatDate(p.visto)}</span>
                    </>
                  ) : (
                    <span className="text-muted">Sin registro todavía</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {visibles.map((x) => {
          const total = clientes.find((c) => c.ownerId === x.id)?._count._all ?? 0;
          const secs = secciones.filter((s) => s.ownerId === x.id);
          const ult = ultima.find((c) => c.senderId === x.id)?._max.at;
          return (
            <section key={x.id} className="card appear flex flex-col gap-3 p-5">
              <div className="flex items-center gap-3">
                <Avatar name={x.name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{x.name}</p>
                  <p className="truncate text-xs text-faint">{x.email}{ult ? ` · activo ${relativeTime(ult)}` : " · todavía sin actividad"}</p>
                </div>
                <Link href={`/contactos?v=${x.id}`} className="text-right">
                  <span className="block font-display text-2xl font-semibold tabular-nums text-white">{total.toLocaleString("es-AR")}</span>
                  <span className="block text-[11px] text-muted">clientes</span>
                </Link>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <Pill tone="neutral">Hoy: {n(x.id, ["busqueda"])} búsquedas</Pill>
                <Pill tone="neutral">{n(x.id, ["mensaje", "mail", "whatsapp"])} mensajes</Pill>
                <Pill tone="neutral">{n(x.id, ["secuencia", "alta", "importo"])} cargas</Pill>
                {n(x.id, ["bloqueo"]) > 0 && <Pill tone="bad">{n(x.id, ["bloqueo"])} bloqueos</Pill>}
              </div>
              {secs.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {secs.map((s) => (
                    <Link
                      key={s.seccion}
                      href={`/contactos?${new URLSearchParams({ v: x.id, sec: s.seccion ?? "" })}`}
                      className="rounded-full bg-white/[.06] px-3 py-1.5 text-xs font-medium text-ink/85 ring-1 ring-white/10 transition hover:text-white"
                    >
                      {s.seccion} <span className="tabular-nums text-faint">· {s._count._all.toLocaleString("es-AR")}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">Sin secciones todavía: cuando {primerNombre(x.name)} busque clientes en el Radar (por ejemplo en Córdoba), se arma «Córdoba – {x.name}».</p>
              )}
            </section>
          );
        })}
        {u.admin && (
          <section className="card appear flex flex-col justify-between gap-2 p-5">
            <div>
              <p className="font-semibold text-white">Clientes libres</p>
              <p className="text-xs text-muted">Sin vendedor: cualquiera los puede tomar. Repartilos desde Contactos marcándolos y eligiendo a quién pasarlos.</p>
            </div>
            <Link href="/contactos?v=libres" className="font-display text-2xl font-semibold tabular-nums text-white">{libres.toLocaleString("es-AR")}</Link>
          </section>
        )}
      </div>

      {u.admin && (
        <Segmented
          label="Actividad de"
          active={quien}
          items={[
            { key: "", label: "Todos", href: qs({ quien: "" }) },
            ...senders.map((x) => ({ key: x.id, label: primerNombre(x.name), href: qs({ quien: x.id }) })),
            { key: "admin", label: "Con contraseña", href: qs({ quien: "admin" }) },
          ]}
        />
      )}
      <Segmented
        label="Tipo de actividad"
        active={tipo}
        items={[{ key: "", label: "Todo", href: qs({ tipo: "" }) }, ...Object.entries(TIPOS_ACTIVIDAD).map(([k, label]) => ({ key: k, label, href: qs({ tipo: k }) }))]}
      />

      <section className="card appear min-w-0 overflow-hidden">
        {actividad.length === 0 ? (
          <Empty title="Todavía no hay actividad">Desde ahora queda registrado todo: quién entra, qué busca, a quién le escribe y a quién suma a sus secuencias.</Empty>
        ) : (
          <div className="divide-y divide-line/60">
            {dias.map((d) => (
              <div key={d.dia}>
                <p className="bg-white/[.03] px-5 py-2 text-[11px] font-semibold uppercase tracking-[.14em] text-faint">{d.dia}</p>
                <ul className="divide-y divide-line/40">
                  {d.items.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5 text-[13.5px]">
                      <span className="w-12 shrink-0 tabular-nums text-faint">{formatDate(a.at).split(", ").pop()}</span>
                      <span className="w-20 shrink-0 font-medium text-white">{primerNombre(a.quien)}</span>
                      <Pill tone={TONO[a.tipo] ?? "neutral"}>{TIPOS_ACTIVIDAD[a.tipo] ?? a.tipo}</Pill>
                      <span className="min-w-0 flex-1 text-ink/90">{a.texto}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
