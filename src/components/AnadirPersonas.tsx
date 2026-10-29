"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  agregarPersona, buscarContactos, buscarRadar, idsRadar, inscribirContactos, inscribirRadar, inscribirRadarTanda,
  type ContactoHallado, type EmpresaHallada, type FiltroRadar, type Resultado,
} from "@/app/(app)/secuencias/personas-actions";
import { BotonCerrar } from "./BotonCerrar";
import { BotonGuardar } from "./BotonGuardar";

type Pestaña = "persona" | "contactos" | "radar" | "etiqueta";
const PESTAÑAS: [Pestaña, string][] = [["persona", "Una persona"], ["contactos", "De Contactos"], ["radar", "Del Radar"], ["etiqueta", "Por etiqueta"]];

function Aviso({ r }: { r: Resultado | null }) {
  if (!r) return null;
  return (
    <p role="status" className={`rounded-xl px-3 py-2 text-[13px] ring-1 ${r.ok ? "bg-ok/[.12] text-[#9BEBC6] ring-ok/25" : "bg-bad/[.12] text-[#FF9A9A] ring-bad/25"}`}>
      {r.ok ? `✓ ${r.ok}` : r.error}
    </p>
  );
}

/** Una persona nueva (o que ya está en Contactos, por su email): se guarda y se suma a la secuencia. */
function UnaPersona({ sequenceId }: { sequenceId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [res, setRes] = useState<Resultado | null>(null);
  const campo = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="flex min-w-0 flex-col">
      <span className="label">{label}</span>
      <input name={name} className="input" {...props} />
    </label>
  );
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget, fd = new FormData(form);
        start(async () => {
          const r = await agregarPersona(sequenceId, null, fd);
          setRes(r);
          if (r.ok) {
            form.reset();
            (form.elements.namedItem("firstName") as HTMLInputElement | null)?.focus();
            router.refresh();
          }
        });
      }}
    >
      {campo("firstName", "Nombre", { autoFocus: true, placeholder: "Marta" })}
      {campo("lastName", "Apellido", { placeholder: "Ruiz" })}
      {campo("email", "Email", { type: "email", inputMode: "email", placeholder: "compras@empresa.com.ar" })}
      {campo("phone", "Teléfono o WhatsApp", { type: "tel", inputMode: "tel", placeholder: "11 5555-1234" })}
      {campo("company", "Empresa", { placeholder: "Logisur SA" })}
      {campo("title", "Cargo", { placeholder: "Jefa de compras" })}
      <p className="text-xs text-muted sm:col-span-2">Hace falta un email o un teléfono. El email pasa por el verificador; si la persona ya está en Contactos, se completan sus datos y se suma igual.</p>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
        <button className="btn" disabled={pending}>{pending ? "Agregando…" : "Agregar a la secuencia"}</button>
      </div>
      <div className="sm:col-span-2"><Aviso r={res} /></div>
    </form>
  );
}

/** Buscador con casillas: contactos de Outreach o empresas del Radar. */
function Buscador<T extends { id: string }>({
  placeholder, buscar, sumar, fila, deshabilitada, vacio, sumarTexto, cabecera, recargar = 0,
}: {
  placeholder: string;
  buscar: (q: string) => Promise<T[]>;
  sumar: (ids: string[]) => Promise<Resultado>;
  fila: (x: T) => React.ReactNode;
  deshabilitada?: (x: T) => string | null;
  vacio: string;
  sumarTexto: (n: number) => string;
  /** Lo que va entre el buscador y la lista; recibe lo que está escrito. */
  cabecera?: (q: string) => React.ReactNode;
  /** Cambiarlo vuelve a buscar (por ejemplo, después de una carga masiva). */
  recargar?: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<T[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [res, setRes] = useState<Resultado | null>(null);
  const [buscando, startB] = useTransition();
  const [sumando, startS] = useTransition();
  const turno = useRef(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const n = ++turno.current;
      startB(async () => { const r = await buscar(q); if (n === turno.current) setLista(r); });
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, buscar, recargar]);
  const elegibles = (lista ?? []).filter((x) => !deshabilitada?.(x));
  const todas = elegibles.length > 0 && elegibles.every((x) => sel.has(x.id));
  return (
    <div className="flex flex-col gap-3">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="input" autoFocus aria-label="Buscar" />
      {cabecera?.(q)}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
        <span>{buscando && !lista ? "Buscando…" : lista ? `${lista.length === 40 ? "Las primeras 40" : lista.length} · ${sel.size} elegida${sel.size === 1 ? "" : "s"}` : ""}</span>
        {elegibles.length > 0 && (
          <button type="button" className="font-semibold text-brand-2 hover:text-white" onClick={() => setSel(todas ? new Set() : new Set([...sel, ...elegibles.map((x) => x.id)]))}>
            {todas ? "Desmarcar estas" : "Marcar todas estas"}
          </button>
        )}
      </div>
      <ul className="well flex max-h-[min(46vh,380px)] flex-col overflow-y-auto p-1" aria-busy={buscando}>
        {lista && lista.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">{vacio}</li>}
        {(lista ?? []).map((x) => {
          const no = deshabilitada?.(x) ?? null;
          return (
            <li key={x.id}>
              <label className={`flex items-center gap-3 rounded-xl px-3 py-2 transition ${no ? "opacity-55" : "cursor-pointer hover:bg-white/[.05]"}`}>
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0"
                  disabled={!!no}
                  checked={sel.has(x.id)}
                  onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(x.id); else s.delete(x.id); setSel(s); }}
                />
                <span className="min-w-0 flex-1">{fila(x)}</span>
                {no && <span className="shrink-0 rounded-full bg-white/[.08] px-2 py-0.5 text-[11.5px] text-muted">{no}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className="btn"
          disabled={!sel.size || sumando}
          onClick={() => startS(async () => {
            const r = await sumar([...sel]);
            setRes(r);
            if (r.ok) { setSel(new Set()); const n = ++turno.current; const l = await buscar(q); if (n === turno.current) setLista(l); router.refresh(); }
          })}
        >
          {sumando ? "Sumando…" : sumarTexto(sel.size)}
        </button>
      </div>
      <Aviso r={res} />
    </div>
  );
}

const FILTROS: [FiltroRadar, string][] = [["canal", "Con email o WhatsApp"], ["email", "Con email"], ["wa", "Con WhatsApp"], ["todas", "Todas"]];
const TANDA = 25;

/**
 * Empresas del Radar: se eligen a mano o se suman todas las que cumplen el filtro (no solo las 40 que se ven).
 * La carga masiva va de a tandas para no pasarse del tiempo de cada pedido y mostrar cuánto falta.
 */
function DelRadar({ sequenceId }: { sequenceId: string }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<FiltroRadar>("canal");
  const [recargar, setRecargar] = useState(0);
  const buscar = useCallback((q: string) => buscarRadar(sequenceId, q, filtro), [sequenceId, filtro]);
  const pl = (n: number, a: string, b: string) => `${n.toLocaleString("es-AR")} ${n === 1 ? a : b}`;
  return (
    <Buscador<EmpresaHallada>
      placeholder="Buscá empresas del Radar por nombre, ciudad, email o teléfono"
      buscar={buscar}
      recargar={recargar}
      sumar={(ids) => inscribirRadar(sequenceId, ids)}
      vacio="No hay empresas del Radar con esa búsqueda."
      deshabilitada={(p) => (p.ya ? "Ya está" : p.bloqueo ?? (p.sinCanal ? "Sin email ni WhatsApp" : null))}
      sumarTexto={(n) => (n ? `Sumar ${pl(n, "empresa", "empresas")}` : "Elegí qué empresas sumar")}
      cabecera={(q) => (
        <>
          <div className="seg" role="group" aria-label="Qué empresas mostrar">
            {FILTROS.map(([k, t]) => (
              <button key={k} type="button" className="seg-item" aria-pressed={filtro === k} aria-current={filtro === k ? "page" : undefined} onClick={() => setFiltro(k)}>
                {t}
              </button>
            ))}
          </div>
          {filtro !== "todas" && (
            <SumarTodas sequenceId={sequenceId} q={q} filtro={filtro} recargar={recargar} listo={() => { setRecargar((n) => n + 1); router.refresh(); }} />
          )}
        </>
      )}
      fila={(p) => (
        <>
          <b className="block truncate font-medium text-white">{p.nombre}</b>
          <span className="block truncate text-xs text-muted">{[p.lugar, p.email, p.telefono].filter(Boolean).join(" · ")}</span>
        </>
      )}
    />
  );
}

/** «Sumar las N»: cuenta todas las empresas que cumplen la búsqueda y el filtro y las suma de a tandas. */
function SumarTodas({ sequenceId, q, filtro, recargar, listo }: { sequenceId: string; q: string; filtro: FiltroRadar; recargar: number; listo: () => void }) {
  const [ids, setIds] = useState<string[] | null>(null);
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null);
  const [res, setRes] = useState<Resultado | null>(null);
  const turno = useRef(0);
  useEffect(() => {
    setIds(null);
    const t = setTimeout(() => {
      const n = ++turno.current;
      idsRadar(sequenceId, q, filtro).then((r) => { if (n === turno.current) setIds(r); }, () => { if (n === turno.current) setIds([]); });
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [sequenceId, q, filtro, recargar]);
  const que = filtro === "email" ? "con email" : filtro === "wa" ? "con WhatsApp" : "con email o WhatsApp";
  const n = ids?.length ?? 0;
  const fmt = (x: number) => x.toLocaleString("es-AR");

  async function sumarTodas() {
    if (!ids?.length) return;
    if (!window.confirm(`¿Sumar ${fmt(ids.length)} ${ids.length === 1 ? "empresa" : "empresas"} del Radar ${que} a esta secuencia?\n\nNo se envía nada ahora: los mensajes salen solo si la secuencia está encendida.`)) return;
    setRes(null);
    const tot = { sumadas: 0, yaEstaban: 0, sinCanal: 0, bajas: 0, corregidos: 0 };
    let error = "";
    setAvance({ hechas: 0, total: ids.length });
    for (let i = 0; i < ids.length; i += TANDA) {
      const r = await inscribirRadarTanda(sequenceId, ids.slice(i, i + TANDA)).catch(() => ({ error: "Se cortó la conexión." }));
      if ("error" in r) { error = r.error; break; }
      tot.sumadas += r.sumadas; tot.yaEstaban += r.yaEstaban; tot.sinCanal += r.sinCanal; tot.bajas += r.bajas; tot.corregidos += r.corregidos;
      setAvance({ hechas: Math.min(i + TANDA, ids.length), total: ids.length });
    }
    setAvance(null);
    const partes = [`${fmt(tot.sumadas)} ${tot.sumadas === 1 ? "empresa sumada" : "empresas sumadas"}`];
    if (tot.yaEstaban) partes.push(`${fmt(tot.yaEstaban)} ya ${tot.yaEstaban === 1 ? "estaba" : "estaban"}`);
    if (tot.sinCanal) partes.push(`${fmt(tot.sinCanal)} sin email ni WhatsApp válido`);
    if (tot.bajas) partes.push(`${fmt(tot.bajas)} ${tot.bajas === 1 ? "omitida" : "omitidas"} por baja o rebote`);
    if (tot.corregidos) partes.push(`${fmt(tot.corregidos)} ${tot.corregidos === 1 ? "email corregido" : "emails corregidos"}`);
    setRes(error ? { error: `${error} Alcanzó a sumar ${partes.join(" · ")}. Podés volver a tocar el botón para seguir con las que faltan.` } : { ok: partes.join(" · ") + "." });
    listo();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="well flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[13px]">
        <span className="text-muted">
          {avance
            ? `Sumando… ${fmt(avance.hechas)} de ${fmt(avance.total)}`
            : ids === null
              ? "Contando…"
              : n
                ? <><b className="font-semibold text-white">{fmt(n)}</b> {n === 1 ? "empresa" : "empresas"} {que}{q.trim() ? " con esa búsqueda" : ""} para sumar</>
                : `No quedan empresas ${que} para sumar${q.trim() ? " con esa búsqueda" : ""}.`}
        </span>
        {n > 0 && (
          <button type="button" className="btn" disabled={!!avance} onClick={sumarTodas}>
            {avance ? "Sumando…" : `Sumar las ${fmt(n)}`}
          </button>
        )}
      </div>
      {avance && (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[.08]" role="progressbar" aria-valuemin={0} aria-valuemax={avance.total} aria-valuenow={avance.hechas}>
          <div className="h-full rounded-full bg-brand-2 transition-all" style={{ width: `${(avance.hechas / avance.total) * 100}%` }} />
        </div>
      )}
      <Aviso r={res} />
    </div>
  );
}

/**
 * «Añadir personas» de una secuencia: una persona cargada a mano, contactos que ya están en Outreach, empresas del
 * Radar o todos los de una etiqueta. Es un diálogo nativo: va por encima de la tabla.
 */
export function AnadirPersonas({ sequenceId, tags, porEtiqueta }: { sequenceId: string; tags: string[]; porEtiqueta: (f: FormData) => Promise<void> }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [pestaña, setPestaña] = useState<Pestaña>("persona");
  const [etqOk, setEtqOk] = useState(false);
  const bContactos = useRef((q: string) => buscarContactos(sequenceId, q)).current;
  const pl = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;
  return (
    <>
      <button type="button" className="btn" onClick={() => { setPestaña("persona"); setEtqOk(false); dlg.current?.showModal(); }}>
        Añadir personas
      </button>
      <dialog ref={dlg} className="dlg max-w-[680px]" aria-labelledby="ap-t" onClick={(e) => e.target === dlg.current && dlg.current?.close()}>
        <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h2 id="ap-t">Añadir personas a la secuencia</h2>
            <p className="text-[13px] text-muted">Se omiten las bajas, los rebotados y quienes ya están en esta secuencia.</p>
          </div>
          <BotonCerrar onClick={() => dlg.current?.close()} />
        </header>
        <div className="px-5 pb-3">
          {/* en el teléfono, dos por fila: así se ven las cuatro sin tener que deslizar */}
          <div className="seg grid w-full grid-cols-2 rounded-[18px] sm:inline-flex sm:w-fit sm:rounded-full" role="tablist" aria-label="Cómo añadir">
            {PESTAÑAS.map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={pestaña === k} aria-current={pestaña === k ? "page" : undefined} className="seg-item justify-center" onClick={() => setPestaña(k)}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {pestaña === "persona" && <UnaPersona sequenceId={sequenceId} />}
          {pestaña === "contactos" && (
            <Buscador<ContactoHallado>
              placeholder="Buscá por nombre, empresa, email, teléfono o etiqueta"
              buscar={bContactos}
              sumar={(ids) => inscribirContactos(sequenceId, ids)}
              vacio="No hay contactos que no estén ya en esta secuencia con esa búsqueda."
              deshabilitada={(c) => c.aviso}
              sumarTexto={(n) => (n ? `Sumar ${pl(n, "persona", "personas")}` : "Elegí a quién sumar")}
              fila={(c) => (
                <>
                  <b className="block truncate font-medium text-white">{c.nombre}</b>
                  <span className="block truncate text-xs text-muted">{[c.empresa, c.email, c.telefono].filter(Boolean).join(" · ") || "Sin datos de contacto"}</span>
                </>
              )}
            />
          )}
          {pestaña === "radar" && <DelRadar sequenceId={sequenceId} />}
          {pestaña === "etiqueta" && (
            <form action={async (f) => { await porEtiqueta(f); setEtqOk(true); }} className="flex flex-col gap-3">
              <label className="flex flex-col">
                <span className="label">Sumar a todos los contactos de la etiqueta</span>
                <select name="tag" className="input" onChange={() => setEtqOk(false)}>
                  <option value="">Todos los contactos</option>
                  {tags.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <p className="text-xs text-muted">Se omiten las bajas, los rebotados, quienes ya están en esta secuencia y a quien no le llegaría ningún paso (por ejemplo, sin email válido en una secuencia solo de emails).</p>
              <div className="flex justify-end"><BotonGuardar avisarCambios={false} enviando="Sumando…" listo="Sumados">Sumar</BotonGuardar></div>
              {etqOk && <Aviso r={{ ok: "Listo: los contactos de esa etiqueta quedaron en la secuencia." }} />}
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
