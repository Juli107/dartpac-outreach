import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ENROLLMENT_STATUS, fullName } from "@/lib/labels";
import { PageHeader, StatusPill, Pill, Empty } from "@/components/ui";
import { addContact, deleteContact } from "./actions";

export const metadata = { title: "Contactos" };

export default async function Contacts({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; importados?: string; actualizados?: string; omitidos?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim();
  const where: Prisma.ContactWhereInput = {
    ...(q ? { OR: ["email", "firstName", "lastName", "company"].map((f) => ({ [f]: { contains: q, mode: "insensitive" } })) } : {}),
    ...(sp.tag ? { tags: { has: sp.tag } } : {}),
  };
  const [contacts, total, allTags] = await Promise.all([
    db.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { enrollments: { include: { sequence: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    db.contact.count({ where }),
    db.contact.findMany({ select: { tags: true } }),
  ]);
  const tags = [...new Set(allTags.flatMap((c) => c.tags))].sort();

  return (
    <>
      <PageHeader title="Contactos" sub={`${total.toLocaleString("es-ES")} contactos${total > 200 ? " · se muestran los 200 más recientes" : ""}`}>
        <Link href="/contactos/importar" className="btn">Importar CSV</Link>
      </PageHeader>

      {sp.importados && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-emerald-800">
          Importación terminada: {sp.importados} nuevos, {sp.actualizados} actualizados, {sp.omitidos} filas omitidas (sin email válido o repetidas).
        </div>
      )}

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, email o empresa" className="input max-w-sm" aria-label="Buscar" />
        <select name="tag" defaultValue={sp.tag ?? ""} className="input max-w-[200px]" aria-label="Etiqueta">
          <option value="">Todas las etiquetas</option>
          {tags.map((t) => <option key={t}>{t}</option>)}
        </select>
        <button className="btn-ghost">Filtrar</button>
      </form>

      <section className="card min-w-0">
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
                      <td className="font-medium">{fullName(c)}</td>
                      <td className="text-muted">{c.email}</td>
                      <td>{c.company}</td>
                      <td>{c.title}</td>
                      <td className="space-x-1">
                        {c.unsubscribed && <Pill tone="bad">Baja</Pill>}
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
        <h2 className="card-title">Añadir contacto</h2>
        <form action={addContact} className="grid gap-3 p-4 sm:grid-cols-3">
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
