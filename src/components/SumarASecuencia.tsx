"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { idsContactos, inscribirContactosTanda } from "@/app/(app)/secuencias/personas-actions";
import type { BusquedaContactos } from "@/lib/contactos-filtros";

const TANDA = 50;
const fmt = (x: number) => x.toLocaleString("es-AR");
const marcadas = () => [...document.querySelectorAll<HTMLInputElement>('input[name="sel-contacto"]:checked')].map((el) => el.value);

/** Casilla de la cabecera: marca o desmarca todos los contactos que se ven. */
export function MarcarTodos() {
  return (
    <input
      type="checkbox"
      className="h-4 w-4 accent-[#3E7BFA]"
      aria-label="Marcar todos los que se ven"
      onChange={(e) => {
        document.querySelectorAll<HTMLInputElement>('input[name="sel-contacto"]').forEach((el) => (el.checked = e.target.checked));
        window.dispatchEvent(new Event("dp:sel"));
      }}
    />
  );
}

/** Casilla de cada fila. */
export function MarcarContacto({ id, nombre }: { id: string; nombre: string }) {
  return <input type="checkbox" name="sel-contacto" value={id} className="h-4 w-4 accent-[#3E7BFA]" aria-label={`Marcar ${nombre}`} onChange={() => window.dispatchEvent(new Event("dp:sel"))} />;
}

/**
 * «Sumar a una secuencia» de Contactos: los marcados o todos los que cumplen la búsqueda y el filtro (no solo los
 * que se ven). Va de a tandas para no pasarse del tiempo de cada pedido. Sumar no envía nada: los mensajes salen
 * cuando la secuencia está encendida.
 */
export function SumarASecuencia({ secuencias, busqueda, total }: { secuencias: { id: string; name: string; on: boolean; pasos: number }[]; busqueda: BusquedaContactos; total: number }) {
  const router = useRouter();
  const [sid, setSid] = useState(secuencias[0]?.id ?? "");
  const [sel, setSel] = useState(0);
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null);
  const [res, setRes] = useState<{ ok?: string; error?: string } | null>(null);
  const [igual, setIgual] = useState(false);
  useEffect(() => {
    const contar = () => setSel(marcadas().length);
    window.addEventListener("dp:sel", contar);
    return () => window.removeEventListener("dp:sel", contar);
  }, []);
  const seq = secuencias.find((s) => s.id === sid);

  async function sumar(todas: boolean) {
    if (!seq) return;
    setRes(null);
    const ids = todas ? await idsContactos(sid, busqueda).catch(() => null) : marcadas();
    if (!ids) return setRes({ error: "No se pudo contar los contactos. Probá de nuevo." });
    if (!ids.length) return setRes({ ok: "No queda nadie para sumar: ya están en esa secuencia, o tienen baja, rebote o «no contactar»." });
    if (!window.confirm(`¿Sumar ${fmt(ids.length)} ${ids.length === 1 ? "contacto" : "contactos"} a «${seq.name}»?\n\nNo se envía nada ahora: los mensajes salen solo cuando la secuencia está encendida.`)) return;
    const tot = { sumadas: 0, yaEstaban: 0, bajas: 0, sinCanal: 0, corregidos: 0 };
    const deOtro: Record<string, number> = {};
    let error = "";
    setAvance({ hechas: 0, total: ids.length });
    for (let i = 0; i < ids.length; i += TANDA) {
      const r = await inscribirContactosTanda(sid, ids.slice(i, i + TANDA), igual).catch(() => ({ error: "Se cortó la conexión." }));
      if ("error" in r) { error = r.error; break; }
      tot.sumadas += r.sumadas; tot.yaEstaban += r.yaEstaban; tot.bajas += r.bajas; tot.sinCanal += r.sinCanal; tot.corregidos += r.corregidos;
      for (const [k, v] of Object.entries(r.deOtro)) deOtro[k] = (deOtro[k] ?? 0) + v;
      setAvance({ hechas: Math.min(i + TANDA, ids.length), total: ids.length });
    }
    setAvance(null);
    const partes = [`${fmt(tot.sumadas)} ${tot.sumadas === 1 ? "contacto sumado" : "contactos sumados"} a «${seq.name}»`];
    if (tot.yaEstaban) partes.push(`${fmt(tot.yaEstaban)} ya ${tot.yaEstaban === 1 ? "estaba" : "estaban"}`);
    if (tot.sinCanal) partes.push(`${fmt(tot.sinCanal)} sin email válido ni WhatsApp`);
    if (tot.bajas) partes.push(`${fmt(tot.bajas)} con baja, rebote o «no contactar»`);
    const otros = Object.entries(deOtro);
    if (otros.length) partes.push(`${otros.map(([n, v]) => `${fmt(v)} ya ${v === 1 ? "lo" : "los"} está trabajando ${n}`).join(", ")} (no se sumaron para no escribirles dos veces)`);
    if (tot.corregidos) partes.push(`${fmt(tot.corregidos)} ${tot.corregidos === 1 ? "email corregido" : "emails corregidos"}`);
    setRes(error ? { error: `${error} Alcanzó a sumar: ${partes.join(" · ")}. Volvé a tocar el botón para seguir con los que faltan.` } : { ok: partes.join(" · ") + "." });
    document.querySelectorAll<HTMLInputElement>('input[name="sel-contacto"]').forEach((el) => (el.checked = false));
    setSel(0);
    router.refresh();
  }

  if (!secuencias.length) {
    return (
      <section className="card appear flex flex-wrap items-center justify-between gap-3 p-4 text-[13px]">
        <span className="text-muted">Para repartir estos contactos primero creá una secuencia.</span>
        <Link href="/secuencias?nueva=1" className="btn">Crear secuencia</Link>
      </section>
    );
  }

  return (
    <section className="card appear flex flex-col gap-3 p-4" aria-label="Sumar a una secuencia">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <label htmlFor="sumar-seq" className="label">Sumar a la secuencia</label>
          <select id="sumar-seq" className="input" value={sid} onChange={(e) => setSid(e.target.value)} disabled={!!avance}>
            {secuencias.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.on ? " · encendida" : " · apagada"}{s.pasos ? "" : " · sin pasos"}</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn-ghost" disabled={!!avance || !sel} onClick={() => sumar(false)}>
          {sel ? `Sumar ${fmt(sel)} ${sel === 1 ? "marcado" : "marcados"}` : "Marcá contactos en la lista"}
        </button>
        <button type="button" className="btn" disabled={!!avance || !total} onClick={() => sumar(true)}>
          {avance ? `Sumando… ${fmt(avance.hechas)} de ${fmt(avance.total)}` : `Sumar los ${fmt(total)} de esta lista`}
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" className="h-4 w-4 accent-[#3E7BFA]" checked={igual} onChange={(e) => setIgual(e.target.checked)} disabled={!!avance} />
        Sumar también los que ya trabaja otro vendedor (por defecto se dejan afuera para no escribirles dos veces)
      </label>
      {avance && (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[.08]" role="progressbar" aria-valuemin={0} aria-valuemax={avance.total} aria-valuenow={avance.hechas}>
          <div className="h-full rounded-full bg-brand-2 transition-all" style={{ width: `${(avance.hechas / avance.total) * 100}%` }} />
        </div>
      )}
      <p className="text-xs text-muted" aria-live="polite">
        {res?.error ? <span className="text-[#FF9A9A]">{res.error}</span> : res?.ok ? <span className="text-white">{res.ok} </span> : null}
        {seq && (
          <>
            Sumar no envía nada. {seq.on ? "Esta secuencia está encendida: los mensajes empiezan a salir en su horario." : "Esta secuencia está apagada: cuando quieras, encendela en "}
            {!seq.on && <Link href={`/secuencias/${seq.id}`} className="font-medium text-brand-2 underline-offset-2 hover:underline">la secuencia</Link>}
            {!seq.on && "."} Usá la búsqueda y los filtros de arriba para elegir a quién (por rubro, ciudad o etiqueta).
          </>
        )}
      </p>
    </section>
  );
}
