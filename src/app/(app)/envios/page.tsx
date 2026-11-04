import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/labels";
import { todayStart } from "@/lib/quota";
import { primerNombre, usuarioActual } from "@/lib/usuario";
import { canalDe, type Canal } from "@/lib/actividad";
import { PageHeader, Empty, Segmented, Pill, Avatar } from "@/components/ui";

export const metadata = { title: "Envíos" };

const CANALES: { key: Canal; label: string; ic: string; tone: "ok" | "info" | "warn" }[] = [
  { key: "mail", label: "Mails", ic: "✉️", tone: "info" },
  { key: "whatsapp", label: "WhatsApp", ic: "💬", tone: "ok" },
  { key: "llamada", label: "Llamadas", ic: "📞", tone: "warn" },
];
const PERIODOS: Record<string, { label: string; dias: number | null }> = {
  hoy: { label: "Hoy", dias: 0 },
  "7": { label: "7 días", dias: 7 },
  "30": { label: "30 días", dias: 30 },
  todo: { label: "Todo", dias: null },
};
const MAX = 20000;

/**
 * Cuántos mails, WhatsApp y llamadas mandó cada remitente y a quién: lo del Radar, lo de Contactos y lo que salió solo
 * de las secuencias. El administrador ve a todos; cada vendedor se ve a sí mismo.
 */
export default async function Envios({ searchParams }: { searchParams: Promise<{ p?: string; quien?: string; canal?: string }> }) {
  const sp = await searchParams;
  const u = await usuarioActual();
  const periodo = sp.p && PERIODOS[sp.p] ? sp.p : "hoy";
  const canal = CANALES.some((c) => c.key === sp.canal) ? (sp.canal as Canal) : "";
  const senders = await db.sender.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const quien = u.admin ? (sp.quien ?? "") : (u.senderId ?? "-");

  const dias = PERIODOS[periodo].dias;
  const desde = dias === null ? null : dias === 0 ? todayStart() : new Date(todayStart().getTime() - (dias - 1) * 86400_000);
  const where: Prisma.ActividadWhereInput = {
    ...(desde ? { at: { gte: desde } } : {}),
    OR: [{ canal: { not: null } }, { canal: null, tipo: { in: ["mail", "whatsapp", "mensaje"] } }],
  };
  const filas = await db.actividad.findMany({
    where,
    orderBy: { at: "desc" },
    take: MAX,
    select: { id: true, at: true, quien: true, senderId: true, tipo: true, texto: true, canal: true, contactId: true },
  });

  // De quién es cada envío: el remitente con el que entró o, con la contraseña común, el que eligió en el Radar.
  const porNombre = new Map(senders.map((s) => [primerNombre(s.name).toLowerCase(), s.id]));
  const duenoDe = (a: { senderId: string | null; quien: string }) => a.senderId ?? porNombre.get(primerNombre(a.quien).toLowerCase()) ?? `n:${a.quien}`;
  const envios = filas
    .map((a) => ({ ...a, c: canalDe(a), dueno: duenoDe(a) }))
    .filter((a): a is typeof a & { c: Canal } => !!a.c);
  const visibles = u.admin ? envios : envios.filter((a) => a.dueno === u.senderId);

  // contadores por persona
  type Fila = { id: string; name: string; mail: number; whatsapp: number; llamada: number; personas: Set<string> };
  const tabla = new Map<string, Fila>();
  for (const s of senders) if (u.admin || s.id === u.senderId) tabla.set(s.id, { id: s.id, name: s.name, mail: 0, whatsapp: 0, llamada: 0, personas: new Set() });
  for (const a of visibles) {
    let f = tabla.get(a.dueno);
    if (!f) tabla.set(a.dueno, (f = { id: a.dueno, name: a.quien || "Sin nombre", mail: 0, whatsapp: 0, llamada: 0, personas: new Set() }));
    f[a.c]++;
    f.personas.add(a.contactId ?? a.texto.split(":")[0]);
  }
  const personas = [...tabla.values()].sort((a, b) => b.mail + b.whatsapp + b.llamada - (a.mail + a.whatsapp + a.llamada));
  const tot = (c: Canal) => personas.reduce((s, f) => s + f[c], 0);

  const lista = visibles.filter((a) => (!quien || a.dueno === quien) && (!canal || a.c === canal)).slice(0, 300);
  const contactos = await db.contact.findMany({
    where: { id: { in: [...new Set(lista.map((a) => a.contactId).filter((x): x is string => !!x))] } },
    select: { id: true, company: true, firstName: true, lastName: true, email: true, phone: true },
  });
  const cMap = new Map(contactos.map((c) => [c.id, c]));
  const aQuien = (a: (typeof lista)[number]) => {
    const c = a.contactId ? cMap.get(a.contactId) : null;
    if (c) return { nombre: c.company || [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || c.phone || "Contacto", dato: a.c === "mail" ? c.email : c.phone };
    const m = a.texto.replace(/^«[^»]*» paso \d+ a /, "").match(/^(?:WhatsApp a |Mail a )?([^:]+?)(?: desde el número.*| por WhatsApp)?(?::|$)/);
    return { nombre: m?.[1] ?? "—", dato: null };
  };

  const qs = (o: Record<string, string>) => {
    const x: Record<string, string> = { p: periodo, ...(quien && u.admin ? { quien } : {}), ...(canal ? { canal } : {}), ...o };
    for (const k of Object.keys(x)) if (!x[k] || (k === "p" && x[k] === "hoy")) delete x[k];
    const s = new URLSearchParams(x).toString();
    return s ? `/envios?${s}` : "/envios";
  };
  const tz = process.env.SEND_TIMEZONE ?? "America/Argentina/Buenos_Aires";

  return (
    <>
      <PageHeader
        title="Envíos"
        sub={u.admin ? "Cuántos mails, WhatsApp y llamadas hizo cada remitente, y a quién." : "Cuántos mails, WhatsApp y llamadas hiciste, y a quién."}
      >
        <Link href="/equipo" className="btn-ghost">Ver equipo</Link>
      </PageHeader>

      <Segmented label="Período" active={periodo} items={["hoy", "7", "30", "todo"].map((k) => [k, PERIODOS[k]] as const).map(([k, v]) => ({ key: k, label: v.label, href: qs({ p: k }) }))} />

      <div className="grid gap-3 sm:grid-cols-3">
        {CANALES.map((c) => (
          <Link key={c.key} href={qs({ canal: canal === c.key ? "" : c.key })} className={`card appear flex items-center gap-3 p-4 transition hover:ring-white/20 ${canal === c.key ? "ring-2 ring-brand-2/60" : ""}`}>
            <span className="text-2xl" aria-hidden>{c.ic}</span>
            <span className="flex-1">
              <span className="block text-xs text-muted">{c.label} · {PERIODOS[periodo].label.toLowerCase()}</span>
              <span className="block font-display text-2xl font-semibold tabular-nums text-white">{tot(c.key).toLocaleString("es-AR")}</span>
            </span>
          </Link>
        ))}
      </div>

      <section className="card appear min-w-0 overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13.5px]">
          <thead>
            <tr className="border-b border-line/60 text-left text-[11px] uppercase tracking-[.12em] text-faint">
              <th className="px-5 py-2.5 font-semibold">Remitente</th>
              <th className="px-3 py-2.5 text-right font-semibold">Mails</th>
              <th className="px-3 py-2.5 text-right font-semibold">WhatsApp</th>
              <th className="px-3 py-2.5 text-right font-semibold">Llamadas</th>
              <th className="px-5 py-2.5 text-right font-semibold">Personas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/40">
            {personas.map((f) => (
              <tr key={f.id} className={quien === f.id ? "bg-white/[.05]" : ""}>
                <td className="px-5 py-2.5">
                  <Link href={u.admin ? qs({ quien: quien === f.id ? "" : f.id }) : qs({})} className="flex items-center gap-2.5 font-medium text-white">
                    <Avatar name={f.name} size={28} />
                    {f.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{f.mail.toLocaleString("es-AR")}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{f.whatsapp.toLocaleString("es-AR")}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{f.llamada.toLocaleString("es-AR")}</td>
                <td className="px-5 py-2.5 text-right tabular-nums text-muted">{f.personas.size.toLocaleString("es-AR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {u.admin && <p className="px-5 pb-3 pt-1 text-[11px] text-faint">Tocá un nombre para ver solo sus envíos. «Personas» cuenta a cuántas empresas distintas les escribió o llamó.</p>}
      </section>

      <section className="card appear min-w-0 overflow-hidden">
        <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
          <p className="font-semibold text-white">
            A quién le escribieron
            {quien && <span className="text-muted"> · {personas.find((f) => f.id === quien)?.name ?? ""}</span>}
            {canal && <span className="text-muted"> · {CANALES.find((c) => c.key === canal)?.label}</span>}
          </p>
          {((u.admin && quien) || canal) && <Link href={qs({ quien: "", canal: "" })} className="text-xs text-brand-2">Ver todo</Link>}
        </div>
        {lista.length === 0 ? (
          <Empty title="Sin envíos en este período">Cuando alguien mande un mail o un WhatsApp, o haga una llamada desde el Radar o desde Contactos, aparece acá.</Empty>
        ) : (
          <ul className="mt-2 divide-y divide-line/40">
            {lista.map((a) => {
              const q = aQuien(a);
              const cn = CANALES.find((c) => c.key === a.c)!;
              return (
                <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5 text-[13.5px]">
                  <span className="w-24 shrink-0 tabular-nums text-faint">
                    {a.at.toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: tz })} {formatDate(a.at).split(", ").pop()}
                  </span>
                  <span className="w-20 shrink-0 font-medium text-white">{primerNombre(a.quien)}</span>
                  <Pill tone={cn.tone}>{cn.ic} {cn.label === "Mails" ? "Mail" : cn.label === "Llamadas" ? "Llamada" : "WhatsApp"}</Pill>
                  <Link href={`/contactos?q=${encodeURIComponent(q.nombre)}`} className="min-w-0 font-medium text-ink hover:text-white">
                    {q.nombre}
                    {q.dato && <span className="ml-1.5 text-xs font-normal text-faint">{q.dato}</span>}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">{a.texto}</span>
                </li>
              );
            })}
          </ul>
        )}
        {lista.length === 300 && <p className="px-5 pb-4 text-xs text-faint">Se muestran los últimos 300. Elegí un remitente o un canal para ver otros.</p>}
      </section>
    </>
  );
}
