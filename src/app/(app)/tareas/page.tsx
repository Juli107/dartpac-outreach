import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { fullName, relativeTime } from "@/lib/labels";
import { PageHeader, Empty } from "@/components/ui";

export const metadata = { title: "Tareas" };

async function toggleTask(id: string, done: boolean) {
  "use server";
  await db.task.update({ where: { id }, data: { done } });
  revalidatePath("/", "layout");
}

export default async function Tasks({ searchParams }: { searchParams: Promise<{ hechas?: string }> }) {
  const showDone = (await searchParams).hechas === "1";
  const tasks = await db.task.findMany({
    where: { done: showDone },
    orderBy: { createdAt: showDone ? "desc" : "asc" },
    take: 200,
    include: { enrollment: { include: { contact: true, sequence: { select: { name: true } } } } },
  });
  return (
    <>
      <PageHeader title="Tareas" sub="Pasos manuales de las secuencias: llamadas, LinkedIn, envío de muestras.">
        <a href={showDone ? "/tareas" : "/tareas?hechas=1"} className="btn-ghost">{showDone ? "Ver pendientes" : "Ver hechas"}</a>
      </PageHeader>
      <section className="card min-w-0">
        {tasks.length === 0 ? (
          <Empty title={showDone ? "Aún no has completado tareas" : "No hay tareas pendientes"} />
        ) : (
          <ul>
            {tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <div className="min-w-0">
                  <b>{t.title}</b>
                  <div className="text-muted">
                    {fullName(t.enrollment.contact)} · {t.enrollment.contact.company} · {t.enrollment.sequence.name} · {relativeTime(t.createdAt)}
                  </div>
                  {t.notes && <p className="mt-1 whitespace-pre-wrap">{t.notes}</p>}
                  <span className="select-all text-xs text-muted">{t.enrollment.contact.phone ?? t.enrollment.contact.email}</span>
                </div>
                <form action={toggleTask.bind(null, t.id, !t.done)}>
                  <button className={t.done ? "btn-ghost" : "btn"}>{t.done ? "Reabrir" : "Hecha"}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
