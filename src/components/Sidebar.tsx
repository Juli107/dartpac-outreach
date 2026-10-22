"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { Level } from "@/lib/health";

// Iconos de trazo fino (24×24), al estilo de SF Symbols.
const ICONS: Record<string, React.ReactNode> = {
  "/": <path d="M4 5h7v6H4zM13 5h7v4h-7zM13 11h7v8h-7zM4 13h7v6H4z" />,
  "/secuencias": <path d="M21 3 3 10.5l7 2.5 2.5 7L21 3zM10 13l4.5-4.5" />,
  "/contactos": <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.7.8 2.8 2.5 3 5.2" />,
  "/bandeja": <path d="M3 13.5 5.5 5h13L21 13.5V19H3zM3 13.5h5l1.5 2.5h5l1.5-2.5h5" />,
  "/buzones": <path d="M3 6h18v12H3zM3 7l9 6.5L21 7" />,
  "/tareas": <path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />,
  "/analiticas": <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  "/remitentes": <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5" />,
};

const NAV = [
  { href: "/", label: "Panel" },
  { href: "/secuencias", label: "Secuencias" },
  { href: "/contactos", label: "Contactos" },
  { href: "/bandeja", label: "Bandeja" },
  { href: "/buzones", label: "Buzones" },
  { href: "/tareas", label: "Tareas" },
  { href: "/analiticas", label: "Analíticas" },
  { href: "/remitentes", label: "Remitentes" },
];

const HEALTH: Record<Level, [string, string]> = {
  ok: ["Todo listo para enviar", "bg-[#34C759]"],
  info: ["Todo listo para enviar", "bg-[#34C759]"],
  off: ["Envíos apagados", "bg-[#C7C7CC]"],
  warn: ["Hay algo que revisar", "bg-[#FF9F0A]"],
  bad: ["Hay envíos frenados", "bg-[#FF3B30]"],
};

export function Sidebar({ counts, health }: { counts: Record<string, number>; health: Level }) {
  const path = usePathname();
  const [healthText, healthDot] = HEALTH[health];
  return (
    <aside className="sticky top-0 z-10 flex flex-col gap-5 border-b border-white/10 bg-[#06162B]/40 px-3 py-4 text-white backdrop-blur-2xl backdrop-saturate-150 md:h-screen md:border-b-0 md:border-r md:py-6">
      <div className="flex items-center gap-2 px-3 md:flex-col md:items-start md:gap-1">
        <Image src="/logo-dartpac-blanco.png" alt="Dartpac" width={112} height={58} priority className="h-auto w-[96px] md:w-[112px]" />
        <span className="text-[11px] font-medium uppercase tracking-[.2em] text-white/60">Outreach</span>
      </div>
      <nav aria-label="Secciones" className="-mx-1 flex flex-row gap-0.5 overflow-x-auto px-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
        {NAV.map((item) => {
          const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 font-medium transition duration-150 ${
                active ? "bg-white text-navy shadow-sm" : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={active ? "" : "text-white/60 group-hover:text-white"}>
                {ICONS[item.href]}
              </svg>
              <span className="flex-1">{item.label}</span>
              {counts[item.href] ? (
                <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${active ? "bg-navy/10" : "bg-white/15 text-white/80"}`}>
                  {counts[item.href].toLocaleString("es-AR")}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <Link href="/#estado" className="mt-auto hidden items-center gap-2.5 rounded-xl bg-white/[.08] px-3 py-2.5 text-[13px] font-medium text-white/90 ring-1 ring-white/10 transition hover:bg-white/[.14] md:flex">
        <span className="relative inline-flex h-2.5 w-2.5">
          {(health === "ok" || health === "info") && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${healthDot}`} />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${healthDot}`} />
        </span>
        {healthText}
      </Link>
    </aside>
  );
}
