import Link from "next/link";
import { db } from "@/lib/db";
import { ENROLLMENT_STATUS, fullName, type Tone } from "@/lib/labels";
import { PageHeader, StatusPill, Pill, Empty, Segmented, Flash, Avatar } from "@/components/ui";
import { FILTROS_CONTACTOS as FILTERS, busquedaContactos, delVendedor, filtroContactos } from "@/lib/contactos-filtros";
import { espejarPendientes } from "@/lib/radar/espejo";
import { asignarDuenosPendientes } from "@/lib/dueno";
import { primerNombre, usuarioActual } from "@/lib/usuario";
import { MarcarContacto, MarcarTodos, SumarASecuencia } from "@/components/SumarASecuencia";
import { AsignarVendedor } from "@/components/AsignarVendedor";
import { addContact, corregirEmail, deleteContact, verificarContactos } from "./actions";

export const metadata = { title: "Contactos" };

const VFY: Record<string, [string, Tone]> = {
  valido: ["Verificado", "ok"],
  riesgoso: ["Riesgoso", "warn"],
  corregible: ["Con tipeo", "warn"],
  invalido: ["Inválido", "bad"],
};

export default async function Contacts({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; f?: string; v?: string; sec?: string; importados?: string; actualizados?: string; omitidos?: string; corregidos?: string; invalidos?: string; deotro?: string; verificados?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim();
  // todo lo del Radar está también acá: si alguna empresa todavía no llegó, entra antes de mostrar la lista
  await espejarPendientes();
  // cada cliente con su vendedor: los que todavía no tienen dueño lo toman de su secuencia o del Radar
  await asignarDuenosPendientes();
  const u = await usuarioActual();
  const filter = filtroContactos(sp.f);
  const v = sp.v ?? "";
  const busqueda = { q, tag: sp.tag, f: filter[0], v, sec: sp.sec };
  const search = busquedaContactos(busqueda);
  const vendedor = delVendedor(busqueda, u);
  const where = { AND: [vendedor, search, filter[2]] };
  const qs = (cambio: Record<string, string>) => {
    const x: Record<string, string> = { ...(q ? { q } : {}), ...(sp.tag ? { tag: sp.tag } : {}), ...(filter[0] !== "todos" ? { f: filter[0] } : {}), ...(v ? { v } : {}), ...(sp.sec ? { sec: sp.sec } : {}), ...cambio };
    for (const k of Object.keys(x)) if (!x[k]) delete x[k];
    return `/contactos?${new URLSearchParams(x)}`;
  };
  const [contacts, total, allTags, counts, sinVerificar, secuencias, senders, secciones, porVendedor] = await Promise.all([
    db.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        owner: { select: { name: true } },
        enrollments: { include: { sequence: { select: { name: true, sender: { select: { name: true } } } } }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    db.contact.count({ where }),
    db.contact.findMany({ where: vendedor, select: { tags: true } }),
    Promise.all(FILTERS.map(([, , w]) => db.contact.count({ where: { AND: [vendedor, search, w] } }))),
    db.contact.count({ where: { AND: [vendedor, { email: { not: null }, emailCheckedAt: null }] } }),
    // un vendedor suma clientes solo a sus secuencias
    db.sequence.findMany({
      where: { status: { not: "ARCHIVED" }, ...(u.admin ? {} : { OR: [{ senderId: u.senderId ?? "-" }, { senderId: null }] }) },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, sendingOn: true, _count: { select: { steps: true } } },
    }),
    db.sender.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.contact.groupBy({ by: ["seccion", "ownerId"], where: { AND: [delVendedor({ v }, u), { seccion: { not: null } }] }, _count: { _all: true }, orderBy: { seccion: "asc" } }),
    db.contact.groupBy({ by: ["ownerId"], where: delVendedor({}, u), _count: { _all: true } }),
  ]);
  const tags = [...new Set(allTags.flatMap((c) => c.tags))].sort();
  const cuantos = (id: string | null) => porVendedor.find((x) => x.ownerId === id)?._count._all ?? 0;
  const vendedores = u.admin
    ? [
        { key: "", label: "Todos", count: porVendedor.reduce((a, x) => a + x._count._all, 0) },
        ...senders.map((x) => ({ key: x.id, label: primerNombre(x.name), count: cuantos(x.id) })),
        { key: "libres", label: "Libres", count: cuantos(null) },
      ]
    : [
        { key: "", label: "Míos y libres", count: cuantos(u.senderId) + cuantos(null) },
        { key: "mios", label: "Míos", count: cuantos(u.senderId) },
        { key: "libres", label: "Libres", count: cuantos(null) },
      ];

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
          {Number(sp.omitidos) ? `, ${sp.omitidos} filas sin email válido o repetidas` : ""}
          {Number(sp.deotro) ? `, ${sp.deotro} que ya son clientes de otro vendedor (no se tocaron)` : ""}.
        </Flash>
      )}
      {sp.verificados && <Flash tone="ok">Listo: se verificaron {sp.verificados} contactos. Los que tienen problemas están en «Email con problemas».</Flash>}
      {sp.error && <Flash tone="bad">{sp.error}</Flash>}

      <Segmented label="Clientes de cada vendedor" active={v} items={vendedores.map((x) => ({ ...x, href: qs({ v: x.key, sec: "" }) }))} />

      {secciones.length > 0 && (
        <section className="card appear flex flex-col gap-2 p-4" aria-label="Secciones">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[13px] font-semibold text-white">Secciones</h2>
            <span className="text-xs text-muted">Cada búsqueda del Radar arma la suya, con la zona y el vendedor</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sp.sec && <Link href={qs({ sec: "" })} className="rounded-full bg-white/[.06] px-3 py-1.5 text-xs font-medium text-ink/80 ring-1 ring-white/10 hover:text-white">Todas</Link>}
            {secciones.map((x) => (
              <Link
                key={`${x.seccion}|${x.ownerId}`}
                href={qs({ sec: x.seccion ?? "" })}
                aria-current={sp.sec === x.seccion ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${sp.sec === x.seccion ? "bg-brand/25 text-white ring-brand/40" : "bg-white/[.06] text-ink/80 ring-white/10 hover:text-white"}`}
              >
                {x.seccion} <span className="tabular-nums text-faint">· {x._count._all.toLocaleString("es-AR")}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Segmented label="Filtrar contactos" active={filter[0]} items={FILTERS.map(([k, label], i) => ({ key: k, label, count: counts[i], href: qs({ f: k === "todos" ? "" : k }) }))} />

      <form className="card appear flex flex-wrap gap-2 p-3">
        {filter[0] !== "todos" && <input type="hidden" name="f" value={filter[0]} />}
        {v && <input type="hidden" name="v" value={v} />}
        {sp.sec && <input type="hidden" name="sec" value={sp.sec} />}
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, empresa, email, ciudad o teléfono" className="input sm:max-w-sm" aria-label="Buscar" />
        <select name="tag" defaultValue={sp.tag ?? ""} className="input min-w-0 flex-1 sm:max-w-[200px] sm:flex-none" aria-label="Etiqueta">
          <option value="">Todas las etiquetas</option>
          {tags.map((t) => <option key={t}>{t}</option>)}
        </select>
        <button className="btn-ghost">Filtrar</button>
      </form>

      <SumarASecuencia
        secuencias={secuencias.map((x) => ({ id: x.id, name: x.name, on: x.sendingOn, pasos: x._count.steps }))}
        busqueda={busqueda}
        total={total}
        admin={u.admin}
      />

      {u.admin && <AsignarVendedor vendedores={senders.map((x) => ({ id: x.id, name: x.name }))} />}

      <section className="card appear min-w-0 overflow-hidden">
        {contacts.length === 0 ? (
          <Empty title="No hay contactos">Importá un CSV, cargá uno a mano abajo o buscá empresas en el Radar: todo lo que entra queda acá.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th className="w-px"><MarcarTodos /></th><th>Contacto</th><th className="hidden sm:table-cell">Email</th><th>Teléfono</th><th>Vendedor</th><th>Etiquetas</th><th>Última secuencia</th><th></th></tr></thead>
              <tbody>
                {contacts.map((c) => {
                  const last = c.enrollments[0];
                  const v = c.emailStatus ? VFY[c.emailStatus] : null;
                  return (
                    <tr key={c.id}>
                      <td className="w-px"><MarcarContacto id={c.id} nombre={fullName(c)} /></td>
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
                      <td className="whitespace-nowrap">
                        {c.owner ? (
                          <span className="flex flex-col items-start gap-0.5">
                            <span className="font-medium text-white">{primerNombre(c.owner.name)}</span>
                            {c.seccion && <span className="block max-w-[180px] truncate text-[11.5px] text-faint" title={c.seccion}>{c.seccion}</span>}
                          </span>
                        ) : (
                          <span className="text-faint">Libre</span>
                        )}
                      </td>
                      <td className="max-w-[220px]"><span className="flex flex-wrap gap-1">
                        {c.radarId && <Pill tone="info">Radar</Pill>}
                        {c.tags.includes("no contactar") && <Pill tone="warn">No contactar</Pill>}
                        {c.unsubscribed && <Pill tone="bad">Baja</Pill>}
                        {c.bounced && <Pill tone="bad">Rebotado</Pill>}
                        {c.tags.filter((t) => t !== "radar" && t !== "no contactar").map((t) => <Pill key={t} tone="neutral">{t}</Pill>)}
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
                        {(u.admin || !c.ownerId || c.ownerId === u.senderId) && <form action={deleteContact.bind(null, c.id)}>
                          <button className="grid h-8 w-8 place-items-center rounded-lg text-[#FF9A9A] transition hover:bg-bad/15 hover:text-white" aria-label={`Eliminar ${fullName(c)}`} title="Eliminar contacto">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
                          </button>
                        </form>}
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
