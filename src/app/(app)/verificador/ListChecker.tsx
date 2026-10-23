"use client";

import { useMemo, useState } from "react";

type Res = { email: string; normal: string; estado: string; motivos: { k: string; t: string }[]; sugerencia: string };

const ESTADOS: Record<string, { t: string; cls: string }> = {
  valido: { t: "Válido", cls: "bg-ok/[.14] text-[#62E6AE] ring-ok/20" },
  corregible: { t: "Con tipeo", cls: "bg-warn/[.14] text-[#FFD587] ring-warn/20" },
  riesgoso: { t: "Riesgoso", cls: "bg-[#FFB347]/[.14] text-[#FFC97A] ring-[#FFB347]/20" },
  invalido: { t: "Inválido", cls: "bg-bad/[.14] text-[#FF9A9A] ring-bad/20" },
  vacio: { t: "Vacío", cls: "bg-white/[.07] text-muted ring-white/10" },
};
const ORDEN = ["corregible", "invalido", "riesgoso", "valido"];
const JUNK = /^[\s"'“”‘’«»`<>()[\]{}]+|[\s"'“”‘’«»`<>()[\]{}.,;:!?]+$/g;

/** Saca las direcciones de un texto pegado (CSV, Excel, una por línea o mezcladas con otras cosas). */
function extraer(texto: string) {
  const out: string[] = [];
  texto.replace(/[​-‍⁠﻿]/g, "").split(/[\s,;]+/).forEach((tok) => {
    if (!tok.includes("@")) return;
    const m = tok.match(/<([^<>]*@[^<>]*)>/);
    let t = (m ? m[1] : tok).replace(/^(?:mailto|e-?mail|correo)\s*:/i, "").replace(/\?.*$/, "").replace(JUNK, "");
    if (t && t.includes("@") && t[0] !== "@") out.push(t);
  });
  return out;
}

export function ListChecker() {
  const [texto, setTexto] = useState("");
  const [res, setRes] = useState<Res[] | null>(null);
  const [rep, setRep] = useState(0);
  const [prog, setProg] = useState<number | null>(null);
  const [filtro, setFiltro] = useState("todos");
  const [aviso, setAviso] = useState("");
  const emails = useMemo(() => extraer(texto), [texto]);

  const correr = async () => {
    const vistos = new Set<string>(), unicos: string[] = [];
    for (const e of emails) {
      const k = e.trim().toLowerCase();
      if (vistos.has(k)) continue;
      vistos.add(k);
      unicos.push(e);
    }
    setRep(emails.length - unicos.length);
    setRes(null);
    setAviso("");
    setProg(0);
    const out: Res[] = [];
    try {
      for (let i = 0; i < unicos.length; i += 400) {
        const r = await fetch("/api/verificar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ emails: unicos.slice(i, i + 400) }) });
        if (!r.ok) throw new Error("No se pudo verificar ahora. Probá de nuevo.");
        out.push(...((await r.json()).resultados as Res[]));
        setProg(Math.round((Math.min(unicos.length, i + 400) / unicos.length) * 100));
      }
      setRes(out);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Error");
    } finally {
      setProg(null);
    }
  };

  const cuenta = (k: string) => (res ?? []).filter((r) => r.estado === k).length;
  const visibles = (res ?? []).filter((r) => filtro === "todos" || r.estado === filtro).sort((a, b) => ORDEN.indexOf(a.estado) - ORDEN.indexOf(b.estado));
  const limpios = (res ?? []).flatMap((r) => (r.estado === "valido" || r.estado === "riesgoso" ? [r.normal] : r.estado === "corregible" && r.sugerencia ? [r.sugerencia] : []));

  const copiar = async () => {
    const t = limpios.join("\n");
    try {
      await navigator.clipboard.writeText(t);
      setAviso(`Copiados ${limpios.length} emails (válidos, riesgosos y los tipeos ya corregidos).`);
    } catch {
      setAviso("No se pudo copiar: seleccioná la lista y copiala a mano.");
    }
  };
  const descargar = () => {
    const filas = [["email", "estado", "motivo", "sugerencia"], ...(res ?? []).map((r) => [r.email, ESTADOS[r.estado]?.t ?? r.estado, r.motivos[0]?.t ?? "", r.sugerencia])];
    const csv = filas.map((f) => f.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "verificacion-de-correos.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="card appear grid gap-3 p-5">
        <label htmlFor="lista" className="label">Pegá los correos (una lista, un CSV o un texto copiado de Excel)</label>
        <textarea id="lista" rows={7} value={texto} onChange={(e) => setTexto(e.target.value)} className="input font-mono text-[13px]" placeholder={"compras@empresa.com.ar\nventas@gmial.com\nlogistica@distribuidora.com.ar; info@otra.com"} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] text-muted">{emails.length ? `${emails.length.toLocaleString("es-AR")} ${emails.length === 1 ? "dirección encontrada" : "direcciones encontradas"}` : "Las direcciones se reconocen solas, aunque vengan mezcladas con otros datos."}</span>
          <div className="flex items-center gap-2">
            <label className="btn-ghost cursor-pointer text-[13px]">
              Subir CSV
              <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f && f.size < 5_000_000) setTexto(await f.text()); }} />
            </label>
            <button className="btn" onClick={correr} disabled={!emails.length || prog !== null}>{prog !== null ? `Verificando… ${prog}%` : "Verificar"}</button>
          </div>
        </div>
        {prog !== null && <div className="h-1.5 overflow-hidden rounded-full bg-white/[.08]"><div className="h-full rounded-full bg-gradient-to-r from-brand-deep to-brand-2 transition-[width] duration-500" style={{ width: `${prog}%` }} /></div>}
        {aviso && <p className="text-[13px] text-muted" aria-live="polite">{aviso}</p>}
      </section>

      {res && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ["valido", "Válidos"],
              ["corregible", "Con tipeo"],
              ["riesgoso", "Riesgosos"],
              ["invalido", "Inválidos"],
            ].map(([k, t]) => (
              <button key={k} onClick={() => setFiltro(filtro === k ? "todos" : k)} className={`card appear px-4 py-3 text-left transition ${filtro === k ? "ring-2 ring-brand/60" : ""}`}>
                <div className="text-[12px] text-muted">{t}</div>
                <div className="font-display text-[26px] font-semibold tabular-nums text-white">{cuenta(k).toLocaleString("es-AR")}</div>
              </button>
            ))}
            <div className="card appear px-4 py-3">
              <div className="text-[12px] text-muted">Repetidos</div>
              <div className="font-display text-[26px] font-semibold tabular-nums text-white">{rep.toLocaleString("es-AR")}</div>
            </div>
          </div>
          <section className="card appear min-w-0 overflow-hidden">
            <div className="card-title flex-wrap">
              <h2>Resultado {filtro !== "todos" && <span className="font-normal text-muted">· {ESTADOS[filtro]?.t}</span>}</h2>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost text-[13px]" onClick={copiar} disabled={!limpios.length}>Copiar la lista limpia ({limpios.length})</button>
                <button className="btn-ghost text-[13px]" onClick={descargar}>Descargar CSV</button>
              </div>
            </div>
            <div className="max-h-[560px] overflow-auto">
              <table className="table">
                <thead><tr><th>Email</th><th>Estado</th><th>Motivo</th><th>Sugerencia</th></tr></thead>
                <tbody>
                  {visibles.slice(0, 1000).map((r, i) => (
                    <tr key={r.email + i}>
                      <td className="max-w-[300px] truncate text-ink/90">{r.email}</td>
                      <td><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${ESTADOS[r.estado]?.cls ?? ""}`}>{ESTADOS[r.estado]?.t ?? r.estado}</span></td>
                      <td className="max-w-[360px] whitespace-normal text-[13px] text-muted">{r.motivos[0]?.t ?? (r.estado === "valido" ? "Sin problemas detectados" : "")}</td>
                      <td className="text-[13px] text-brand-2">{r.sugerencia}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
