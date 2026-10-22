import { Sidebar } from "@/components/Sidebar";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [sequences, contacts, unread, tasks] = await Promise.all([
    db.sequence.count({ where: { status: { not: "ARCHIVED" } } }),
    db.contact.count(),
    db.reply.count({ where: { read: false } }),
    db.task.count({ where: { done: false } }),
  ]);
  return (
    <div className="grid min-h-screen md:grid-cols-[232px_1fr]">
      <Sidebar
        counts={{ "/secuencias": sequences, "/contactos": contacts, "/bandeja": unread, "/tareas": tasks }}
        mailbox={process.env.SMTP_USER}
      />
      <main className="flex min-w-0 flex-col gap-5 px-4 py-6 md:px-7">{children}</main>
    </div>
  );
}
