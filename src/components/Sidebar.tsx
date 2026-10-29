"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Level } from "@/lib/health";
import { NotificationBell } from "@/components/NotificationBell";

// Iconos de trazo fino (24×24), al estilo de SF Symbols.
const ICONS: Record<string, React.ReactNode> = {
  "/": (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  "/secuencias": <path d="M20.5 3.5L10.2 13.8M20.5 3.5l-6.4 17-3.9-6.7-6.7-3.9z" />,
  "/contactos": <path d="M9 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM3.5 19.5c.8-3.3 3-5.2 5.5-5.2s4.7 1.9 5.5 5.2M17.2 11.5a2.5 2.5 0 1 0 0-5M16.4 14.3c2.2.3 3.7 1.9 4.2 4.4" />,
  "/bandeja": <path d="M3.5 13.5l2.6-7.7A1.8 1.8 0 0 1 7.8 4.5h8.4a1.8 1.8 0 0 1 1.7 1.3l2.6 7.7M3.5 13.5V18a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-4.5h-5.2l-1.4 2.4h-3.8l-1.4-2.4z" />,
  "/whatsapp": <path d="M4.3 19.7l1.1-3.9A8.2 8.2 0 1 1 8.6 19zM9 8.6c.2 2.9 3.4 6.1 6.4 6.4l1.1-1.4-2-1-.9.8c-1-.4-2.1-1.5-2.5-2.5l.8-.9-1-2z" />,
  "/equipo": <path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15.5 11a3 3 0 1 0 0-6M3 19.5c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M16.6 14.8c2.3.3 3.9 2 4.4 4.7" />,
  "/reparto": <path d="M12 3v6M12 9l-6 5M12 9l6 5M12 9v6M4 17h4v4H4zM10 17h4v4h-4zM16 17h4v4h-4z" />,
  "/tareas": <path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />,
  "/analiticas": <path d="M5 20v-7M10 20V5M15 20v-9M20 20V8" />,
  "/radar": (
    <>
      <circle cx="12" cy="12" r="8.5" opacity=".45" />
      <circle cx="12" cy="12" r="4.6" opacity=".75" />
      <path d="M12 12l6.2-6.2" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  "/verificador": <path d="M20.5 12V7a2 2 0 0 0-2-2h-13a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7M3.9 6.6L12 12.6l8.1-6M15.4 18.2l2.1 2.1 4-4.3" />,
  "/buzones": <path d="M3.5 6.5h17v11h-17zM3.8 7l8.2 6.2L20.2 7" />,
  "/remitentes": <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5" />,
};

const GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
  {
    label: "Outreach",
    items: [
      { href: "/", label: "Panel" },
      { href: "/secuencias", label: "Secuencias" },
      { href: "/contactos", label: "Contactos" },
      { href: "/equipo", label: "Equipo" },
      { href: "/reparto", label: "Reparto diario" },
      { href: "/bandeja", label: "Bandeja" },
      { href: "/whatsapp", label: "WhatsApp" },
      { href: "/tareas", label: "Tareas" },
      { href: "/analiticas", label: "Analíticas" },
    ],
  },
  {
    label: "Clientes",
    items: [
      { href: "/radar", label: "Radar comercial" },
      { href: "/verificador", label: "Verificar correos" },
    ],
  },
  {
    label: "Correo",
    items: [
      { href: "/buzones", label: "Buzones" },
      { href: "/remitentes", label: "Remitentes" },
    ],
  },
];
const NAV = GROUPS.flatMap((g) => g.items);

/** Secciones de la barra inferior en el móvil. */
const TAB_BAR = ["/", "/radar", "/secuencias", "/bandeja", "/buzones"];
const SHORT: Record<string, string> = { "/radar": "Radar" };

const HEALTH: Record<Level, [string, string]> = {
  ok: ["Todo listo para enviar", "bg-ok"],
  info: ["Todo listo para enviar", "bg-ok"],
  off: ["Envíos apagados", "bg-[#5E7398]"],
  warn: ["Hay algo que revisar", "bg-warn"],
  bad: ["Hay envíos frenados", "bg-bad"],
};

const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

function Svg({ href, size = 19, strong = false }: { href: string; size?: number; strong?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strong ? 2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[href]}
    </svg>
  );
}

export function Sidebar({ counts, live, health, usuario }: { counts: Record<string, number>; live: string[]; health: Level; usuario: { name: string; admin: boolean } }) {
  const path = usePathname();
  const enRadar = path === "/radar";
  const [healthText, healthDot] = HEALTH[health];
  const navRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ top: number; height: number } | null>(null);

  // Indicador que se desliza hasta la sección elegida.
  const measure = () => {
    const nav = navRef.current;
    const a = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!nav || !a || !a.offsetHeight) return setInd(null);
    setInd({ top: a.offsetTop, height: a.offsetHeight });
  };
  useLayoutEffect(measure, [path]);
  useEffect(() => {
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, []);

  return (
    <aside
      className={`z-20 flex flex-col gap-4 px-3 pt-3 md:sticky md:top-0 md:h-screen md:gap-5 md:overflow-y-auto md:border-r md:border-white/[.08] md:bg-gradient-to-b md:from-[#10284E]/60 md:to-[#06142A]/40 md:px-4 md:py-5 md:backdrop-blur-2xl md:backdrop-saturate-150 ${enRadar ? "max-md:p-0" : ""}`}
    >
      <div className={`flex items-center justify-between gap-2 pl-2 ${enRadar ? "max-md:hidden" : ""}`}>
        <div className="flex items-center gap-2 md:flex-col md:items-start md:gap-1.5">
          <Image src="/logo-dartpac-blanco.png" alt="Dartpac" width={112} height={58} priority className="h-auto w-[92px] md:w-[108px]" />
          <span className="text-[9.5px] font-semibold uppercase tracking-[.34em] text-muted">Outreach</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/buzones#salud" className="grid h-9 w-9 place-items-center rounded-full bg-white/[.07] ring-1 ring-white/10 md:hidden" aria-label={healthText} title={healthText}>
            <span className={`h-2.5 w-2.5 rounded-full ${healthDot}`} />
          </Link>
          <NotificationBell />
        </div>
      </div>

      <nav aria-label="Secciones" ref={navRef} className="relative hidden flex-col md:flex">
        {ind && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 rounded-xl bg-gradient-to-b from-brand/[.22] to-brand/[.10] shadow-[inset_0_0_0_1px_rgba(120,185,255,.26),0_8px_22px_-12px_rgba(28,102,228,.8)] transition-all duration-500 ease-spring"
            style={{ top: ind.top, height: ind.height }}
          />
        )}
        {GROUPS.map((g, gi) => (
          <div key={g.label} className="flex flex-col gap-0.5">
            <p className={`mb-1.5 pl-3 text-[10.5px] font-semibold uppercase tracking-[.16em] text-faint ${gi ? "mt-4" : ""}`}>{g.label}</p>
            {g.items.filter((item) => usuario.admin || item.href !== "/reparto").map((item) => {
              const active = isActive(item.href, path);
              const n = counts[item.href];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`group relative z-[1] flex h-10 shrink-0 items-center gap-2.5 rounded-xl px-3 font-medium transition duration-200 ${active ? "text-white" : "text-ink/75 hover:bg-white/[.045] hover:text-white"}`}
                >
                  <span className={`transition duration-300 group-active:scale-90 ${active ? "text-brand" : "text-muted group-hover:text-white"}`}>
                    <Svg href={item.href} />
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {n ? (
                    live.includes(item.href) ? (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gradient-to-b from-[#2F7FF5] to-[#1859CF] px-1.5 text-[11px] font-semibold tabular-nums text-white shadow-glow">{n > 99 ? "99+" : n}</span>
                    ) : (
                      <span className="text-[12px] font-semibold tabular-nums text-faint">{n.toLocaleString("es-AR")}</span>
                    )
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* En el móvil: las secciones secundarias arriba y las cinco principales en una barra fija abajo, como en iOS.
          En el Radar no se muestran: ocupa toda la pantalla con su propio menú, y su marca vuelve a Outreach. */}
      <nav aria-label="Más secciones" className={`-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 md:hidden ${enRadar ? "max-md:hidden" : ""}`} style={{ scrollbarWidth: "none" }}>
        {NAV.filter((i) => !TAB_BAR.includes(i.href) && (usuario.admin || i.href !== "/reparto")).map((item) => {
          const active = isActive(item.href, path);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${active ? "bg-brand/25 text-white ring-brand/40" : "bg-white/[.06] text-ink/80 ring-white/10"}`}
            >
              {item.label}
              {counts[item.href] ? ` · ${counts[item.href]}` : ""}
            </Link>
          );
        })}
      </nav>
      <nav
        aria-label="Secciones principales"
        className={`fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-white/10 bg-[#06152B]/85 px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-2xl md:hidden ${enRadar ? "max-md:hidden" : ""}`}
      >
        {TAB_BAR.map((href) => NAV.find((i) => i.href === href)!).map((item) => {
          const active = isActive(item.href, path);
          const n = counts[item.href];
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-w-[56px] flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-[11px] font-medium transition ${active ? "text-white" : "text-ink/55"}`}
            >
              <span className={active ? "text-brand" : ""}>
                <Svg href={item.href} size={22} strong={active} />
              </span>
              {SHORT[item.href] ?? item.label}
              {n && live.includes(item.href) ? (
                <span className="absolute right-2 top-0 min-w-4 rounded-full bg-bad px-1 text-center text-[10px] leading-4 text-white">{n > 99 ? "99+" : n}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* quién está usando la app; «Salir» para que entre otro con su cuenta */}
      <div className="hidden items-center gap-2.5 rounded-xl px-3 py-1 text-[13px] md:mt-auto md:flex">
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-white">{usuario.name}</span>
          <span className="block text-[11px] text-faint">{usuario.admin ? "Administrador · ve todo" : "Vendedor · tus clientes"}</span>
        </span>
        <a href="/login/salir" className="shrink-0 text-xs font-medium text-muted transition hover:text-white">Salir</a>
      </div>
      <Link
        href="/buzones#salud"
        className="hidden items-center gap-2.5 rounded-xl bg-white/[.05] px-3 py-2.5 text-[13px] font-medium text-ink/90 ring-1 ring-white/[.08] transition hover:bg-white/[.09] md:flex"
      >
        <span className="relative inline-flex h-2.5 w-2.5">
          {(health === "ok" || health === "info") && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${healthDot}`} />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${healthDot}`} />
        </span>
        <span>{healthText}</span>
      </Link>
    </aside>
  );
}
