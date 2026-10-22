import { Sidebar } from "@/components/Sidebar";
import { db } from "@/lib/db";
import { overallHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [sequences, contacts, unread, tasks, health] = await Promise.all([
    db.sequence.count({ where: { status: { not: "ARCHIVED" } } }),
    db.contact.count(),
    db.reply.count({ where: { read: false } }),
    db.task.count({ where: { done: false } }),
    overallHealth().catch(() => null),
  ]);
  return (
    <div className="relative isolate md:grid md:min-h-screen md:grid-cols-[240px_1fr]">
      <div className="app-bg" aria-hidden>
        <div className="login-blob login-blob-a" />
        <div className="login-blob login-blob-b" />
        <div className="login-blob login-blob-c" />
        <div className="login-grid" />
      </div>
      <Sidebar
        counts={{ "/secuencias": sequences, "/contactos": contacts, "/bandeja": unread, "/tareas": tasks }}
        health={health?.level ?? "warn"}
      />
      <main className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-6 px-4 pb-28 pt-4 md:px-8 md:py-9">{children}</main>
    </div>
  );
}
