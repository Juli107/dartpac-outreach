"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Doc = { c: string; id: string; d: Record<string, unknown> };

/**
 * El Radar comercial (mapa 3D, empresas, búsquedas) corre en su propia página dentro de la plataforma.
 * Este marco le pasa los avisos a la campanita, la navegación a Outreach y, la primera vez, la carga de la base.
 */
export function RadarFrame({ ir, vacio, ia }: { ir: string | null; vacio: boolean; ia: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const router = useRouter();
  const [src] = useState(() => `/radar-app/index.html${ir ? `#ir=${encodeURIComponent(ir)}` : ""}`);
  const [importar, setImportar] = useState(vacio);
  const [avisoIa, setAvisoIa] = useState(!ia);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== ref.current?.contentWindow || !e.data || typeof e.data !== "object") return;
      const m = e.data as { type: string; href?: string; src?: string; L?: unknown[]; meta?: unknown; o?: unknown };
      if (m.type === "dp:nav" && typeof m.href === "string" && m.href.startsWith("/")) router.push(m.href);
      if (m.type === "dp:notif") window.dispatchEvent(new CustomEvent("dp:radar-notif", { detail: { src: m.src, L: m.L, meta: m.meta } }));
      if (m.type === "dp:banner") window.dispatchEvent(new CustomEvent("dp:banner", { detail: m.o }));
      if (m.type === "dp:sesion") location.href = "/login";
    };
    const onIr = (e: Event) => ref.current?.contentWindow?.postMessage({ type: "dp:radar-ir", ir: (e as CustomEvent).detail }, location.origin);
    window.addEventListener("message", onMsg);
    window.addEventListener("dp:radar-ir", onIr);
    return () => {
      window.removeEventListener("message", onMsg);
      window.removeEventListener("dp:radar-ir", onIr);
    };
  }, [router]);

  return (
    <div className="relative h-full w-full">
      <iframe ref={ref} src={src} title="Radar comercial" className="absolute inset-0 h-full w-full border-0 bg-transparent" allow="clipboard-write" />
      {importar && <Importar onListo={() => { setImportar(false); ref.current?.contentWindow?.location.reload(); }} onCerrar={() => setImportar(false)} />}
      {!importar && avisoIa && (
        <div className="card absolute inset-x-3 bottom-[92px] z-10 flex items-start gap-3 p-4 text-[13px] ring-1 ring-warn/30 md:inset-x-auto md:bottom-auto md:left-6 md:top-[164px] md:max-w-sm">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-warn" />
          <div className="min-w-0">
            <b className="text-white">La búsqueda con Claude todavía no está activa</b>
            <p className="mt-0.5 text-muted">Falta cargar la clave de la API de Claude (ANTHROPIC_API_KEY) en Vercel. El mapa, las empresas y los contactos ya funcionan.</p>
          </div>
          <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setAvisoIa(false)} aria-label="Cerrar aviso">✕</button>
        </div>
      )}
    </div>
  );
}

function Importar({ onListo, onCerrar }: { onListo: () => void; onCerrar: () => void }) {
  const [estado, setEstado] = useState<{ t: string; pct?: number; error?: boolean } | null>(null);
  const cargar = async (file: File) => {
    try {
      setEstado({ t: "Leyendo el archivo…", pct: 0 });
      const j = JSON.parse(await file.text()) as { docs?: Doc[] };
      const docs = (j.docs ?? []).filter((x) => x && x.c && x.id && x.d);
      if (!docs.length) throw new Error("El archivo no trae empresas del Radar.");
      let nuevos = 0, actualizados = 0;
      for (let i = 0; i < docs.length; i += 150) {
        const res = await fetch("/api/radar/importar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ docs: docs.slice(i, i + 150) }) });
        const r = await res.json();
        if (!res.ok) throw new Error(r.detail ?? "No se pudo cargar.");
        nuevos += r.nuevos;
        actualizados += r.actualizados;
        setEstado({ t: `Cargando… ${Math.min(docs.length, i + 150)} de ${docs.length}`, pct: Math.round((Math.min(docs.length, i + 150) / docs.length) * 100) });
      }
      setEstado({ t: `Listo: ${nuevos} documentos nuevos${actualizados ? ` y ${actualizados} actualizados` : ""}.`, pct: 100 });
      setTimeout(onListo, 900);
    } catch (e) {
      setEstado({ t: e instanceof Error ? e.message : "No se pudo leer el archivo.", error: true });
    }
  };
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[#030A17]/55 p-4 backdrop-blur-sm">
      <div className="card appear w-full max-w-md p-6">
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand/15 text-brand-2 ring-1 ring-brand/25">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="8.5" opacity=".45" /><circle cx="12" cy="12" r="4.6" opacity=".75" /><path d="M12 12l6.2-6.2" /></svg>
        </span>
        <h2 className="text-[19px]">Traé tu base del Radar</h2>
        <p className="mt-1 text-muted">Subí el archivo <b className="text-white">radar-dartpac.json</b> que exportó Claude: carga tus empresas, búsquedas y alertas. Se hace una sola vez y no borra nada.</p>
        <label className="btn mt-5 w-full cursor-pointer">
          Elegir el archivo
          <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => e.target.files?.[0] && cargar(e.target.files[0])} />
        </label>
        {estado && (
          <div className="mt-4" aria-live="polite">
            {estado.pct != null && !estado.error && (
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[.08]"><div className="h-full rounded-full bg-gradient-to-r from-brand-deep to-brand-2 transition-[width] duration-500" style={{ width: `${estado.pct}%` }} /></div>
            )}
            <p className={`mt-2 text-[13px] ${estado.error ? "text-[#FF9A9A]" : "text-muted"}`}>{estado.t}</p>
          </div>
        )}
        <button className="mt-4 w-full text-center text-[13px] text-muted hover:text-white" onClick={onCerrar}>Ahora no: empezar con el Radar vacío</button>
      </div>
    </div>
  );
}
