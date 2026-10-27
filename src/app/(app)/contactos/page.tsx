import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ENROLLMENT_STATUS, fullName, type Tone } from "@/lib/labels";
import { PageHeader, StatusPill, Pill, Empty, Segmented, Flash, Avatar } from "@/components/ui";
import { addContact, corregirEmail, deleteContact, verificarContactos } from "./actions";

export const metadata = { title: "Contactos" };

const FILTERS: [string, string, Prisma.ContactWhereInput][] = [
  ["todos", "Todos", {}],
  ["radar", "Del Radar", { radarId: { not: null } }],
  ["abrieron", "Abrieron", { enrollments: { some: { messages: { some: { openedAt: { not: null } } } } } }],
  ["respondieron", "Respondieron", { replies: { some: {} } }],
  ["problemas", "Email con problemas", { emailStatus: { in: ["invalido", "corregible"] } }],
  ["sinemail", "Sin email", { email: null }],
  ["rebotados", "Rebotados", { bounced: true }],
  ["bajas", "Bajas", { unsubscribed: true }],
];

const VFY: Record<string, [string, Tone]> = {
  valido: ["Verificado", "ok"],
  riesgoso: ["Riesgoso", "warn"],
  corregible: ["Con tipeo", "warn"],
  invalido: ["Inválido", "bad"],
};

export default async function Contacts({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; f?: string; importados?: string; actualizados?: string; omitidos?: string; corregidos?: string; invalidos?: string; verificados?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim();
  const filter = FILTERS.find(([k]) => k === sp.f) ?? FILTERS[0];
  const search: Prisma.ContactWhereInput = {
    ...(q ? { OR: ["email", "firstName", "lastName", "company", "city", "phone"].map((f) => ({ [f]: { contains: q, mode: "insensitive" } })) } : {}),
    ...(sp.tag ? { tags: { has: sp.tag } } : {}),
  };
  const where: Prisma.ContactWhereInput = { AND: [search, filter[2]] };
  const qs = (f: string) => `/contactos?${new URLSearchParams({ ...(q ? { q } : {}), ...(sp.tag ? { tag: sp.tag } : {}), f })}`;
  const [contacts, total, allTags, counts, sinVerificar] = await Promise.all([
    db.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { enrollments: { include: { sequence: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    db.contact.count({ where }),
    db.contact.findMany({ select: { tags: true } }),
    Promise.all(FILTERS.map(([, , w]) => db.contact.count({ where: { AND: [search, w] } }))),
    db.contact.count({ where: { email: { not: null }, emailCheckedAt: null } }),
  ]);
  const tags = [...new Set(allTags.flatMap((c) => c.tags))].sort();

  return (
    <>
      <PageHeader title="Contactos" sub={`${total.toLocaleString("es-AR")} contactos${total > 200 ? " · se muestran los 200 más recientes" : ""}`}>
        {sinVerificar > 0 && (
          <form action={verificarContactos}>
            <button className="btn-ghost" title="Revisa formato, tipeos y que el dominio reciba correo. No manda nada.">Verificar {sinVerificar.toLocaleString("es-AR")} sin revisar</button>
          </form>
        )}
        <Link href="/verificador" className="btn-ghost">Verificador</Link>
        <Link href="/contactos/importar" className="btn">Importar CSV</Link>
      </PageHeader>

      {sp.importados && (
        <Flash tone="ok">
          Importación terminada: {sp.importados} nuevos, {sp.actualizados} actualizados
          {Number(sp.corregidos) ? `, ${sp.corregidos} emails con tipeo corregido` : ""}
          {Number(sp.invalidos) ? `, ${sp.invalidos} inválidos que no se cargaron` : ""}
          {Number(sp.omitidos) ? `, ${sp.omitidos} filas sin email válido o repetidas` : ""}.
        </Flash>
      )}
      {sp.verificados && <Flash tone="ok">Listo: se verificaron {sp.verificados} contactos. Los que tienen problemas están en «Email con problemas».</Flash>}
      {sp.error && <Flash tone="bad">{sp.error}</Flash>}

      <Segmented label="Filtrar contactos" active={filter[0]} items={FILTERS.map(([k, label], i) => ({ key: k, label, count: counts[i], href: qs(k) }))} />

      <form className="card appear flex flex-wrap gap-2 p-3">
        {filter[0] !== "todos" && <input type="hidden" name="f" value={filter[0]} />}
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, empresa, email, ciudad o teléfono" className="input sm:max-w-sm" aria-label="Buscar" />
        <select name="tag" defaultValue={sp.tag ?? ""} className="input min-w-0 flex-1 sm:max-w-[200px] sm:flex-none" aria-label="Etiqueta">
          <option value="">Todas las etiquetas</option>
          {tags.map((t) => <option key={t}>{t}</option>)}
        </select>
        <button className="btn-ghost">Filtrar</button>
      </form>

      <section className="card appear min-w-0 overflow-hidden">
        {contacts.length === 0 ? (
          <Empty title="No hay contactos">Importá un CSV, cargá uno a mano abajo o sumá empresas desde el Radar.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Contacto</th><th className="hidden sm:table-cell">Email</th><th>Teléfono</th><th>Etiquetas</th><th>Última secuencia</th><th></th></tr></thead>
              <tbody>
                {contacts.map((c) => {
                  const last = c.enrollments[0];
                  const v = c.emailStatus ? VFY[c.emailStatus] : null;
                  return (
                    <tr key={c.id}>
                      <td className="min-w-[220px] max-w-[240px] sm:min-w-0 sm:max-w-[260px]">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={fullName(c)} size={30} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-white">{fullName(c)}</span>
                            <span className="block truncate text-xs text-faint">{[c.company && c.company !== fullName(c) ? c.company : "", c.title, c.city].filter(Boolean).join(" · ")}</span>
                            {/* en el celular el email va debajo del nombre, sin tener que deslizar la tabla */}
                            {c.email && <span className="block truncate text-xs text-ink/80 sm:hidden">{c.email}</span>}
                          </span>
                        </span>
                      </td>
                      <td className="hidden sm:table-cell">
                        {c.email ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="block max-w-[240px] truncate text-ink/90" title={c.email}>{c.email}</span>
                            <span className="flex items-center gap-1.5">
                              {v ? <Pill tone={v[1]} title={c.emailReason ?? undefined}>{v[0]}</Pill> : <span className="text-[11px] text-faint">Sin verificar</span>}
                              {c.emailStatus === "corregible" && c.emailSuggestion && (
                                <form action={corregirEmail.bind(null, c.id)}><button className="text-[11.5px] font-medium text-brand-2 hover:text-white" title={c.emailReason ?? ""}>Corregir a {c.emailSuggestion}</button></form>
                              )}
                            </span>
                          </div>
                        ) : (
                          <span className="text-faint">–</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-muted">{c.whatsapp || c.phone || <span className="text-faint">–</span>}</td>
                      <td className="max-w-[220px]"><span className="flex flex-wrap gap-1">
                        {c.radarId && <Pill tone="info">Radar</Pill>}
                        {c.unsubscribed && <Pill tone="bad">Baja</Pill>}
                        {c.bounced && <Pill tone="bad">Rebotado</Pill>}
                        {c.tags.filter((t) => t !== "radar").map((t) => <Pill key={t} tone="neutral">{t}</Pill>)}
                      </span></td>
                      <td className="max-w-[200px]">
                        {last ? (
                          <span className="flex flex-col items-start gap-1">
                            <span className="block max-w-full truncate text-ink/90" title={last.sequence.name}>{last.sequence.name}</span>
                            <StatusPill map={ENROLLMENT_STATUS} value={last.status} />
                          </span>
                        ) : (
                          <span className="text-faint">–</span>
                        )}
                      </td>
                      <td className="w-px">
                        <form action={deleteContact.bind(null, c.id)}>
                          <button className="grid h-8 w-8 place-items-center rounded-lg text-[#FF9A9A] transition hover:bg-bad/15 hover:text-white" aria-label={`Eliminar ${fullName(c)}`} title="Eliminar contacto">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card appear">
        <div className="card-title"><h2>Agregar contacto</h2><span className="text-xs text-muted">Con email o, si no tiene, con teléfono</span></div>
        <form action={addContact} className="grid gap-3 px-5 pb-5 pt-2 sm:grid-cols-3">
          {[
            ["email", "Email", "email"],
            ["phone", "Teléfono o WhatsApp", "tel"],
            ["company", "Empresa", "text"],
            ["firstName", "Nombre", "text"],
            ["lastName", "Apellido", "text"],
            ["title", "Cargo", "text"],
            ["tags", "Etiquetas (separadas por comas)", "text"],
          ].map(([name, label, type]) => (
            <div key={name}>
              <label htmlFor={`c-${name}`} className="label">{label}</label>
              <input id={`c-${name}`} name={name} type={type} className="input" />
            </div>
          ))}
          <div className="flex items-end"><button className="btn">Guardar contacto</button></div>
        </form>
      </section>
    </>
  );
}
