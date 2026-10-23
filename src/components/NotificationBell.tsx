"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";

type Item = {
  id: string;
  g: "curso" | "hoy" | "nov" | "base";
  ic: string;
  tono?: string;
  n: number;
  t: string;
  d?: string;
  href?: string;
  ir?: Record<string, unknown>;
  vista?: string;
  cuando?: number;
};
type Leidas = Record<string, { n: number; t: number }>;
type Banner = { key: string; it: Item };

const KEY = "dpo.notif.v1";
const GRUPOS: [Item["g"], string][] = [["curso", "En curso"], ["hoy", "Para hoy"], ["nov", "Novedades"], ["base", "Para revisar"]];
const TONO: Record<string, string> = { ok: "bg-ok/15 ring-ok/25", warn: "bg-warn/15 ring-warn/25", bad: "bg-bad/15 ring-bad/25", info: "bg-brand/15 ring-brand/25", hot: "bg-[#FFB347]/15 ring-[#FFB347]/25" };

function cargarLeidas(): Leidas {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}").leidas ?? {};
  } catch {
    return {};
  }
}
function guardarLeidas(L: Leidas) {
  try {
    const ahora = Date.now(), out: Leidas = {};
    for (const [k, v] of Object.entries(L)) if (ahora - (v.t || 0) < 21 * 864e5) out[k] = v;
    localStorage.setItem(KEY, JSON.stringify({ leidas: out }));
  } catch {}
}
const hace = (t?: number) => {
  if (!t) return "";
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 2) return "recién";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `${d} días`;
};

/** Campanita: junta los avisos de Outreach y del Radar, con globos como en el iPhone. */
export function NotificationBell() {
  const router = useRouter();
  const path = usePathname();
  const [server, setServer] = useState<Item[]>([]);
  const [radar, setRadar] = useState<{ L: Item[]; at: number } | null>(null);
  const [leidas, setLeidas] = useState<Leidas>({});
  const [abierto, setAbierto] = useState(false);
  const [marca, setMarca] = useState<Set<string>>(new Set());
  const [banners, setBanners] = useState<Banner[]>([]);
  const vistos = useRef<Set<string> | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const [montado, setMontado] = useState(false);
  useEffect(() => {
    setLeidas(cargarLeidas());
    setMontado(true);
  }, []);

  // Los avisos del Radar abierto (más completos) reemplazan a los que arma el servidor para el Radar.
  const radarFresco = radar && Date.now() - radar.at < 10 * 60_000 ? radar.L : null;
  const todos: Item[] = [...server.filter((x) => !(radarFresco && (x.href === "/radar" || x.ir))), ...(radarFresco ?? [])];
  const noLeida = (it: Item) => it.n > 0 && (!leidas[it.id] || it.n > (leidas[it.id].n || 0));
  const sinLeer = todos.filter(noLeida).length;

  const banner = useCallback((it: Item) => {
    const key = it.id + ":" + Date.now();
    setBanners((b) => [...b.slice(-2), { key, it }]);
    setTimeout(() => setBanners((b) => b.filter((x) => x.key !== key)), 6500);
  }, []);

  const traer = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const r = await fetch("/api/notificaciones", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { L: Item[] };
      setServer(j.L ?? []);
      const ids = new Set((j.L ?? []).map((x) => x.id));
      if (vistos.current) {
        const L = cargarLeidas();
        (j.L ?? []).filter((x) => !vistos.current!.has(x.id) && x.n > 0 && !L[x.id] && x.g !== "curso").slice(0, 2).forEach(banner);
      }
      vistos.current = ids;
    } catch {}
  }, [banner]);

  useEffect(() => {
    traer();
    const t = setInterval(traer, 60_000);
    const vis = () => document.visibilityState === "visible" && traer();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [traer]);

  // avisos y globos que manda el Radar desde su marco
  useEffect(() => {
    const onNotif = (e: Event) => {
      const d = (e as CustomEvent).detail as { src: string; L: Item[] };
      if (!d || !Array.isArray(d.L)) return;
      setRadar((prev) => {
        const otros = (prev?.L ?? []).filter((x) => !x.id.startsWith(d.src + ":"));
        return { L: [...otros, ...d.L.map((x) => ({ ...x, id: `${d.src}:${x.id}`, href: x.vista ? `/${x.vista}` : "/radar" }))], at: Date.now() };
      });
    };
    const onBanner = (e: Event) => {
      const o = (e as CustomEvent).detail as { t?: string; d?: string; ic?: string; tono?: string; ir?: Record<string, unknown> };
      if (o?.t) banner({ id: "b:" + o.t, g: "nov", ic: o.ic ?? "🔔", tono: o.tono, n: 1, t: o.t, d: o.d, ir: o.ir, href: "/radar" });
    };
    window.addEventListener("dp:radar-notif", onNotif);
    window.addEventListener("dp:banner", onBanner);
    return () => {
      window.removeEventListener("dp:radar-notif", onNotif);
      window.removeEventListener("dp:banner", onBanner);
    };
  }, [banner]);

  const marcarTodas = () => {
    const L = { ...leidas };
    todos.forEach((it) => it.n > 0 && (L[it.id] = { n: it.n, t: Date.now() }));
    setLeidas(L);
    guardarLeidas(L);
    setMarca(new Set());
  };

  const abrir = () => {
    setMarca(new Set(todos.filter(noLeida).map((x) => x.id)));
    setAbierto(true);
    setTimeout(() => {
      const L = cargarLeidas();
      todos.forEach((it) => it.n > 0 && (L[it.id] = { n: it.n, t: Date.now() }));
      setLeidas(L);
      guardarLeidas(L);
    }, 1200);
  };

  const ir = (it: Item) => {
    setAbierto(false);
    if (it.ir) {
      if (path === "/radar") window.dispatchEvent(new CustomEvent("dp:radar-ir", { detail: it.ir }));
      else router.push(`/radar?ir=${encodeURIComponent(JSON.stringify(it.ir))}`);
      return;
    }
    if (it.href) router.push(it.href);
  };

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (setAbierto(false), btn.current?.focus());
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        aria-label={sinLeer ? `Notificaciones: ${sinLeer} sin leer` : "Notificaciones"}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        className="relative grid h-9 w-9 place-items-center rounded-xl bg-white/[.06] text-ink ring-1 ring-white/10 transition hover:bg-white/[.1] active:scale-95"
      >
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={sinLeer ? "origin-[50%_12%] animate-[campana_1.2s_ease-in-out_1]" : ""}>
          <path d="M6 10.5a6 6 0 0 1 12 0c0 4.6 1.7 6 2 6.5H4c.3-.5 2-1.9 2-6.5z" />
          <path d="M10 20a2.2 2.2 0 0 0 4 0" />
        </svg>
        {sinLeer > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[10.5px] font-bold text-white shadow-[0_0_0_2px_#0b2545] [animation:pop_.45s_cubic-bezier(.34,1.4,.64,1)]">
            {sinLeer > 9 ? "9+" : sinLeer}
          </span>
        )}
      </button>

      {montado && createPortal(<>
      {abierto && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Notificaciones"
          className="card fixed inset-x-3 top-16 z-50 flex max-h-[min(70vh,560px)] flex-col overflow-hidden shadow-lift [animation:slide-in_.35s_cubic-bezier(.2,.8,.2,1)] md:inset-x-auto md:left-[264px] md:top-4 md:w-[380px]"
        >
          <div className="flex items-center gap-2 border-b border-line/60 px-4 py-3">
            <h2 className="flex-1 text-[15px]">Notificaciones</h2>
            <button type="button" className="text-[13px] font-medium text-brand-2 hover:text-white" onClick={marcarTodas}>Marcar leídas</button>
            <button type="button" className="grid h-7 w-7 place-items-center rounded-full bg-white/[.07] text-muted hover:text-white" onClick={() => setAbierto(false)} aria-label="Cerrar notificaciones">✕</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {todos.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-ok/15 text-ok ring-1 ring-ok/25">✓</span>
                <b className="text-white">Estás al día</b>
                <p className="mt-1 text-[13px] text-muted">Cuando el Radar encuentre empresas, te respondan o tengas tareas para hoy, aparecen acá.</p>
              </div>
            ) : (
              GRUPOS.map(([g, nom]) => {
                const I = todos.filter((x) => x.g === g).sort((a, b) => (b.cuando || 0) - (a.cuando || 0));
                if (!I.length) return null;
                return (
                  <div key={g} className="mb-1">
                    <p className="px-2 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[.14em] text-faint">{nom}</p>
                    {I.map((it) => (
                      <button key={it.id} type="button" onClick={() => ir(it)} className={`flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-white/[.06] ${marca.has(it.id) ? "bg-brand/[.08]" : ""}`}>
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[17px] ring-1 ${TONO[it.tono ?? ""] ?? "bg-white/[.06] ring-white/10"}`} aria-hidden>
                          {g === "curso" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-2 border-t-transparent" /> : it.ic}
                        </span>
                        <span className="min-w-0 flex-1">
                          <b className="block text-[13.5px] font-semibold leading-snug text-white">{it.t}</b>
                          {it.d && <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{it.d}</span>}
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1 pt-0.5 text-[11px] text-faint">
                          {it.cuando ? hace(it.cuando) : null}
                          {marca.has(it.id) && <i className="h-2 w-2 rounded-full bg-brand" aria-label="Nuevo" />}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* globos */}
      <div className="pointer-events-none fixed right-3 top-3 z-[60] flex w-[min(360px,calc(100vw-24px))] flex-col gap-2" aria-live="polite">
        {banners.map(({ key, it }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setBanners((b) => b.filter((x) => x.key !== key));
              ir(it);
            }}
            className="card pointer-events-auto flex items-start gap-3 p-3 text-left shadow-lift [animation:slide-in_.4s_cubic-bezier(.2,.8,.2,1)]"
          >
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[17px] ring-1 ${TONO[it.tono ?? ""] ?? "bg-white/[.06] ring-white/10"}`} aria-hidden>{it.ic}</span>
            <span className="min-w-0">
              <b className="block text-[13.5px] text-white">{it.t}</b>
              {it.d && <span className="line-clamp-2 block text-xs text-muted">{it.d}</span>}
            </span>
          </button>
        ))}
      </div>
      </>, document.body)}
    </>
  );
}
