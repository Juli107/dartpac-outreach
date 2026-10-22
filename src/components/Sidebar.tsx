"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Panel" },
  { href: "/secuencias", label: "Secuencias" },
  { href: "/contactos", label: "Contactos" },
  { href: "/bandeja", label: "Bandeja" },
  { href: "/tareas", label: "Tareas" },
  { href: "/analiticas", label: "Analíticas" },
];

export function Sidebar({ counts, mailbox }: { counts: Record<string, number>; mailbox?: string }) {
  const path = usePathname();
  return (
    <aside className="flex flex-col gap-6 bg-navy px-4 py-5 text-navy-50 md:min-h-screen">
      <div className="flex flex-col items-center gap-1.5 py-1.5">
        <Image src="/logo-dartpac-blanco.png" alt="Dartpac" width={132} height={69} priority />
        <span className="text-[10px] font-medium uppercase tracking-[3px] opacity-70">Outreach</span>
      </div>
      <nav aria-label="Secciones" className="flex flex-row flex-wrap gap-0.5 md:flex-col">
        {NAV.map((item) => {
          const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex justify-between rounded-lg px-3 py-2 font-medium transition ${
                active ? "bg-navy-700 opacity-100 shadow-[inset_3px_0_0_#E8EEF7]" : "opacity-80 hover:bg-navy-700 hover:opacity-100"
              }`}
            >
              {item.label}
              {counts[item.href] ? <span className="font-mono text-xs opacity-75">{counts[item.href].toLocaleString("es-ES")}</span> : null}
            </Link>
          );
        })}
      </nav>
      {mailbox && (
        <div className="mt-auto hidden text-xs leading-relaxed opacity-80 md:block">
          Buzón conectado
          <br />
          <strong>{mailbox}</strong>
        </div>
      )}
    </aside>
  );
}
