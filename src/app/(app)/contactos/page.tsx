import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ENROLLMENT_STATUS, fullName } from "@/lib/labels";
import { PageHeader, StatusPill, Pill, Empty, Segmented, Flash, Avatar } from "@/components/ui";
import { addContact, deleteContact } from "./actions";

export const metadata = { title: "Contactos" };

const FILTERS: [string, string, Prisma.ContactWhereInput][] = [
  ["todos", "Todos", {}],
  ["abrieron", "Abrieron", { enrollments: { some: { messages: { some: { openedAt: { not: null } } } } } }],
  ["respondieron", "Respondieron", { replies: { some: {} } }],
  ["rebotados", "Rebotados", { bounced: true }],
  ["bajas", "Bajas", { unsubscribed: true }],
  ["llamar", "Por llamar", { enrollments: { some: { tasks: { some: { done: false } } } } }],
];

export default async function Contacts({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; f?: string; importados?: string; actualizados?: string; omitidos?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim();
  const filter = FILTERS.find(([k]) => k === sp.f) ?? FILTERS[0];
  const search: Prisma.ContactWhereInput = {
    ...(q ? { OR: ["email", "firstName", "lastName", "company"].map((f) => ({ [f]: { contains: q, mode: "insensitive" } })) } : {}),
    ...(sp.tag ? { tags: { has: sp.tag } } : {}),
  };
  const where: Prisma.ContactWhereInput = { AND: [search, filter[2]] };
  const qs = (f: string) => `/contactos?${new URLSearchParams({ ...(q ? { q } : {}), ...(sp.tag ? { tag: sp.tag } : {}), f })}`;
  const [contacts, total, allTags, counts] = await Promise.all([
    db.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { enrollments: { include: { sequence: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    db.contact.count({ where }),
    db.contact.findMany({ select: { tags: true } }),
    Promise.all(FILTERS.map(([, , w]) => db.contact.count({ where: { AND: [search, w] } }))),
  ]);
  const tags = [...new Set(allTags.flatMap((c) => c.tags))].sort();

  return (
    <>
      <PageHeader title="Contactos" sub={`${total.toLocaleString("es-ES")} contactos${total > 200 ? " · se muestran los 200 más recientes" : ""}`}>
        <Link href="/contactos/importar" className="btn">Importar CSV</Link>
      </PageHeader>

      {sp.importados && (
        <Flash tone="ok">
          Importación terminada: {sp.importados} nuevos, {sp.actualizados} actualizados, {sp.omitidos} filas omitidas (sin email válido o repetidas).
        </Flash>
      )}

      <Segmented label="Filtrar contactos" active={filter[0]} items={FILTERS.map(([k, label], i) => ({ key: k, label, count: counts[i], href: qs(k) }))} />

      <form className="card appear flex flex-wrap gap-2 p-3">
        {filter[0] !== "todos" && <input type="hidden" name="f" value={filter[0]} />}
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, email o empresa" className="input max-w-sm" aria-label="Buscar" />
        <select name="tag" defaultValue={sp.tag ?? ""} className="input max-w-[200px]" aria-label="Etiqueta">
          <option value="">Todas las etiquetas</option>
          {tags.map((t) => <option key={t}>{t}</option>)}
        </select>
        <button className="btn-ghost">Filtrar</button>
      </form>

      <section className="card appear min-w-0 overflow-hidden">
        {contacts.length === 0 ? (
          <Empty title="No hay contactos">Importa un CSV o añade uno a mano abajo.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Nombre</th><th>Email</th><th>Empresa</th><th>Cargo</th><th>Etiquetas</th><th>Última secuencia</th><th></th></tr></thead>
              <tbody>
                {contacts.map((c) => {
                  const last = c.enrollments[0];
                  return (
                    <tr key={c.id}>
                      <td><span className="flex items-center gap-2.5 font-medium"><Avatar name={fullName(c)} size={28} />{fullName(c)}</span></td>
                      <td className="text-muted">{c.email}</td>
                      <td>{c.company}</td>
                      <td>{c.title}</td>
                      <td className="space-x-1">
                        {c.unsubscribed && <Pill tone="bad">Baja</Pill>}
                        {c.bounced && <Pill tone="bad">Rebotado</Pill>}
                        {c.tags.map((t) => <Pill key={t} tone="neutral">{t}</Pill>)}
                      </td>
                      <td>{last ? <><span className="mr-2">{last.sequence.name}</span><StatusPill map={ENROLLMENT_STATUS} value={last.status} /></> : <span className="text-muted">–</span>}</td>
                      <td><form action={deleteContact.bind(null, c.id)}><button className="btn-danger" aria-label={`Eliminar ${c.email}`}>Eliminar</button></form></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-title"><h2>Añadir contacto</h2></div>
        <form action={addContact} className="grid gap-3 px-5 pb-5 pt-2 sm:grid-cols-3">
          {[
            ["email", "Email", "email"],
            ["firstName", "Nombre", "text"],
            ["lastName", "Apellidos", "text"],
            ["company", "Empresa", "text"],
            ["title", "Cargo", "text"],
            ["tags", "Etiquetas (separadas por comas)", "text"],
          ].map(([name, label, type]) => (
            <div key={name}>
              <label htmlFor={`c-${name}`} className="label">{label}</label>
              <input id={`c-${name}`} name={name} type={type} required={name === "email"} className="input" />
            </div>
          ))}
          <div><button className="btn">Guardar contacto</button></div>
        </form>
      </section>
    </>
  );
}
