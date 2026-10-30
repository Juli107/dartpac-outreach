import { Sidebar } from "@/components/Sidebar";
import { Presencia } from "@/components/Presencia";
import { db } from "@/lib/db";
import { overallHealth } from "@/lib/health";
import { radarHoyCount } from "@/lib/radar/store";
import { alcanceContactos, usuarioActual } from "@/lib/usuario";

/** Estructura de la app: fondo azul marino, barra lateral de vidrio y área de trabajo. `full` deja el área sin márgenes (Radar). */
export async function AppShell({ children, full = false }: { children: React.ReactNode; full?: boolean }) {
  const u = await usuarioActual();
  const [sequences, contacts, unread, tasks, radar, health] = await Promise.all([
    db.sequence.count({ where: { status: { not: "ARCHIVED" } } }),
    db.contact.count({ where: alcanceContactos(u) }),
    db.reply.count({ where: { read: false } }),
    db.task.count({ where: { done: false } }),
    radarHoyCount().catch(() => 0),
    overallHealth().catch(() => null),
  ]);
  return (
    <div className={`relative isolate md:grid md:grid-cols-[252px_minmax(0,1fr)] ${full ? "flex h-[100dvh] flex-col overflow-hidden md:h-screen" : "md:min-h-screen"}`}>
      <Presencia />
      <div className="app-bg" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <Sidebar
        counts={{ "/secuencias": sequences, "/contactos": contacts, "/bandeja": unread, "/tareas": tasks, "/radar": radar }}
        live={["/bandeja", "/radar"]}
        health={health?.level ?? "warn"}
        usuario={{ name: u.name, admin: u.admin }}
      />
      {full ? (
        <main className="relative min-h-0 min-w-0 flex-1 pb-[env(safe-area-inset-bottom)] md:h-screen md:pb-0">{children}</main>
      ) : (
        <main className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-6 px-4 pb-28 pt-4 md:px-8 md:py-9">{children}</main>
      )}
    </div>
  );
}
