"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { asignarContactos } from "@/app/(app)/contactos/actions";

const marcadas = () => [...document.querySelectorAll<HTMLInputElement>('input[name="sel-contacto"]:checked')].map((el) => el.value);

/** Solo el administrador: pasa los contactos marcados a un vendedor (o los deja libres). No envía nada. */
export function AsignarVendedor({ vendedores }: { vendedores: { id: string; name: string }[] }) {
  const router = useRouter();
  const [sel, setSel] = useState(0);
  const [a, setA] = useState(vendedores[0]?.id ?? "");
  const [res, setRes] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    const contar = () => setSel(marcadas().length);
    window.addEventListener("dp:sel", contar);
    return () => window.removeEventListener("dp:sel", contar);
  }, []);

  async function asignar() {
    const ids = marcadas();
    if (!ids.length) return;
    const nombre = vendedores.find((v) => v.id === a)?.name ?? "nadie (libres)";
    if (!window.confirm(`¿Pasar ${ids.length} ${ids.length === 1 ? "contacto" : "contactos"} a ${nombre}?`)) return;
    setOcupado(true);
    const r = await asignarContactos(ids, a).catch(() => ({ error: "Se cortó la conexión." }));
    setOcupado(false);
    setRes("error" in r ? r.error : r.ok);
    document.querySelectorAll<HTMLInputElement>('input[name="sel-contacto"]').forEach((el) => (el.checked = false));
    setSel(0);
    router.refresh();
  }

  return (
    <section className="card appear flex flex-wrap items-end gap-2 p-4" aria-label="Repartir clientes">
      <div className="min-w-0 flex-1 sm:max-w-xs">
        <label htmlFor="asignar-a" className="label">Pasar los marcados a</label>
        <select id="asignar-a" className="input" value={a} onChange={(e) => setA(e.target.value)}>
          {vendedores.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          <option value="">Nadie (dejarlos libres)</option>
        </select>
      </div>
      <button type="button" className="btn-ghost" disabled={!sel || ocupado} onClick={asignar}>
        {ocupado ? "Pasando…" : sel ? `Pasar ${sel} ${sel === 1 ? "marcado" : "marcados"}` : "Marcá contactos en la lista"}
      </button>
      <p className="w-full text-xs text-muted" aria-live="polite">
        {res ? <span className="text-white">{res} </span> : null}
        Solo lo ves vos (administrador). Cada cliente tiene un vendedor: los demás no le pueden escribir.
      </p>
    </section>
  );
}
