import Link from "next/link";
import type { Tone } from "@/lib/labels";
import type { Check, Level } from "@/lib/health";

const TONES: Record<Tone, string> = {
  ok: "bg-[#34C759]/[.12] text-[#248A3D]",
  warn: "bg-[#FF9F0A]/[.14] text-[#B25000]",
  bad: "bg-[#FF3B30]/[.10] text-[#D70015]",
  info: "bg-brand-soft text-brand",
  neutral: "bg-black/[.05] text-muted",
};

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export function StatusPill({ map, value }: { map: Record<string, [string, Tone]>; value: string }) {
  const [label, tone] = map[value] ?? [value, "neutral"];
  return <Pill tone={tone}>{label}</Pill>;
}

export function PageHeader({ title, sub, back, children }: { title: React.ReactNode; sub?: React.ReactNode; back?: { href: string; label: string }; children?: React.ReactNode }) {
  return (
    <header className="appear flex flex-wrap items-end justify-between gap-3 text-white">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-flex items-center gap-1 text-[13px] font-medium text-white/70 hover:text-white">
            <span aria-hidden>‹</span> {back.label}
          </Link>
        )}
        <h1>{title}</h1>
        {sub && <div className="mt-1 text-[15px] text-white/70">{sub}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card appear px-5 py-4">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1 font-display text-[28px] font-semibold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function ProgressBar({ value, tone = "brand", className = "w-28" }: { value: number; tone?: "brand" | "warn"; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-black/[.06] ${className}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-[width] duration-700 ${tone === "warn" ? "bg-[#FF9F0A]" : "bg-brand"}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="font-display text-[15px] font-semibold">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-muted">{children}</div>}
    </div>
  );
}

const DOT: Record<Level, string> = {
  ok: "bg-[#34C759]",
  info: "bg-brand",
  warn: "bg-[#FF9F0A]",
  bad: "bg-[#FF3B30]",
  off: "bg-[#C7C7CC]",
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
    <ul className="divide-y divide-line/70">
      {checks.map((c, i) => (
        <li key={i} className="flex gap-3 px-5 py-2.5">
          <span className="pt-1.5"><Dot level={c.level} /></span>
          <div className="min-w-0">
            <div className="font-medium">{c.title}</div>
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
  const hues = ["#0B2545", "#0A66D8", "#5E5CE6", "#30B0C7", "#248A3D", "#B25000", "#AF52DE"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white shadow-sm"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(145deg, ${hues[h % hues.length]}, ${hues[(h + 3) % hues.length]})` }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function Flash({ tone, children }: { tone: "ok" | "bad" | "warn"; children: React.ReactNode }) {
  const cls = tone === "ok" ? "text-[#1E6E33]" : tone === "warn" ? "text-[#8A3F00]" : "text-[#B0000F]";
  const dot = tone === "ok" ? "bg-[#34C759]" : tone === "warn" ? "bg-[#FF9F0A]" : "bg-[#FF3B30]";
  return (
    <div role="status" className={`appear flex items-start gap-3 rounded-2xl bg-white px-4 py-3 text-sm shadow-soft ${cls}`}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <div>{children}</div>
    </div>
  );
}
