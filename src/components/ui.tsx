import Link from "next/link";
import type { Tone } from "@/lib/labels";
import type { Check, Level } from "@/lib/health";

const TONES: Record<Tone, string> = {
  ok: "bg-ok/[.14] text-[#62E6AE] ring-ok/20",
  warn: "bg-warn/[.14] text-[#FFD587] ring-warn/20",
  bad: "bg-bad/[.14] text-[#FF9A9A] ring-bad/20",
  info: "bg-brand/[.16] text-brand-2 ring-brand/25",
  neutral: "bg-white/[.07] text-muted ring-white/[.08]",
};

export function Pill({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function StatusPill({ map, value }: { map: Record<string, [string, Tone]>; value: string }) {
  const [label, tone] = map[value] ?? [value, "neutral"];
  return <Pill tone={tone}>{label}</Pill>;
}

export function PageHeader({ title, sub, back, children }: { title: React.ReactNode; sub?: React.ReactNode; back?: { href: string; label: string }; children?: React.ReactNode }) {
  return (
    // relative z-30: la animación de entrada crea su propia capa, y sin esto los menús desplegables del encabezado
    // (por ejemplo «Nueva secuencia») quedaban debajo de la tarjeta siguiente y no se podían tocar.
    <header className="appear relative z-30 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-flex items-center gap-1 text-[13px] font-medium text-muted transition hover:text-white">
            <span aria-hidden>‹</span> {back.label}
          </Link>
        )}
        <h1>{title}</h1>
        {sub && <div className="mt-1 text-[15px] text-muted">{sub}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="card appear relative overflow-hidden px-5 py-4">
      {accent && <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-brand/20 blur-2xl" />}
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div className="mt-1 font-display text-[28px] font-semibold tabular-nums tracking-tight text-white" data-count>
        {value}
      </div>
      {hint && <div className="text-xs text-faint">{hint}</div>}
    </div>
  );
}

export function ProgressBar({ value, tone = "brand", className = "w-28" }: { value: number; tone?: "brand" | "warn"; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-white/[.08] ${className}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={`h-full rounded-full transition-[width] duration-700 ${tone === "warn" ? "bg-warn" : "bg-gradient-to-r from-brand-deep to-brand-2"}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white/[.06] text-brand-2 ring-1 ring-white/[.08]">{icon}</span>}
      <div className="font-display text-[15px] font-semibold text-white">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-muted">{children}</div>}
    </div>
  );
}

const DOT: Record<Level, string> = {
  ok: "bg-ok",
  info: "bg-brand",
  warn: "bg-warn",
  bad: "bg-bad",
  off: "bg-[#5E7398]",
};

export function Dot({ level, pulse }: { level: Level; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
      {pulse && level === "ok" && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${DOT[level]}`} />}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${DOT[level]}`} />
    </span>
  );
}

/** Lista de comprobaciones con su punto de color. */
export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="divide-y divide-line/60">
      {checks.map((c, i) => (
        <li key={i} className="flex gap-3 px-5 py-2.5">
          <span className="pt-1.5"><Dot level={c.level} /></span>
          <div className="min-w-0">
            <div className="font-medium text-white">{c.title}</div>
            {c.detail && <div className="break-words text-[13px] text-muted">{c.detail}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Control segmentado con enlaces (pestañas y filtros). */
export function Segmented({ items, active, label }: { items: { key: string; href: string; label: React.ReactNode; count?: number }[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="seg">
      {items.map((it) => (
        <Link key={it.key} href={it.href} scroll={false} aria-current={it.key === active ? "page" : undefined} className="seg-item">
          {it.label}
          {it.count !== undefined && <span className="count">{it.count.toLocaleString("es-AR")}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Iniciales en un círculo de color estable por nombre. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  const hues = ["#2F7BF6", "#5E5CE6", "#1F9BB8", "#2E9E5B", "#C77C1E", "#A64BD6", "#3A6BC9"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25)] ring-1 ring-white/10"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(145deg, ${hues[h % hues.length]}, ${hues[(h + 3) % hues.length]})` }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function Flash({ tone, children }: { tone: "ok" | "bad" | "warn" | "info"; children: React.ReactNode }) {
  const dot = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : tone === "info" ? "bg-brand" : "bg-bad";
  const ring = tone === "ok" ? "ring-ok/25" : tone === "warn" ? "ring-warn/25" : tone === "info" ? "ring-brand/25" : "ring-bad/25";
  return (
    <div role="status" className={`card appear flex items-start gap-3 px-4 py-3 text-sm text-ink ring-1 ${ring}`}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Ícono de trazo fino (24×24), al estilo de SF Symbols. */
export function Icon({ d, size = 18, className = "", stroke = 1.8 }: { d: React.ReactNode; size?: number; className?: string; stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {d}
    </svg>
  );
}
