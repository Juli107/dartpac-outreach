import Link from "next/link";
import { sequenceStats, formatPct } from "@/lib/stats";
import { SEQUENCE_STATUS } from "@/lib/labels";
import { PageHeader, StatusPill, ProgressBar, Empty } from "@/components/ui";
import { createSequence } from "./actions";

export const metadata = { title: "Secuencias" };

export default async function Sequences() {
  const sequences = await sequenceStats();
  return (
    <>
      <PageHeader title="Secuencias" sub="Cada secuencia es una campaña: pasos con esperas que se envían solos a cada contacto." />
      <form action={createSequence} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="name" className="label">Nombre de la nueva secuencia</label>
          <input id="name" name="name" required placeholder="Ej.: Distribuidores de embalaje · Q4" className="input" />
        </div>
        <button className="btn">Crear secuencia</button>
      </form>
      <section className="card min-w-0">
        {sequences.length === 0 ? (
          <Empty title="Aún no hay secuencias">Crea una arriba y añade sus pasos.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Secuencia</th><th>Estado</th><th>Pasos</th><th>Contactos</th><th>Enviados</th><th>Apertura</th><th>Respuesta</th><th>Progreso</th></tr></thead>
              <tbody>
                {sequences.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/secuencias/${s.id}`} className="font-medium hover:text-brand">{s.name}</Link></td>
                    <td><StatusPill map={SEQUENCE_STATUS} value={s.status} /></td>
                    <td>{s._count.steps}</td>
                    <td>{s._count.enrollments}</td>
                    <td>{s.sent}</td>
                    <td>{formatPct(s.openRate)}</td>
                    <td>{formatPct(s.replyRate)}</td>
                    <td><ProgressBar value={s.progress} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
