"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { guardarVariables } from "@/app/(app)/secuencias/actions";
import { CLAVE_VALIDA, RESERVADAS, VARIABLES_CONTACTO, VARIABLES_ENVIO, type Propia, type Variables } from "@/lib/template";
import { BotonCerrar } from "./BotonCerrar";

type Estado = { mi: string; propias: Propia[]; siFalta: Record<string, string>; saludo: { manana: string; tarde: string; noche: string } };

const desde = (c: Variables): Estado => ({
  mi: c.propias?.find((p) => p.clave === "mi_empresa")?.valor ?? "",
  propias: (c.propias ?? []).filter((p) => p.clave !== "mi_empresa").map((p) => ({ ...p })),
  siFalta: { ...(c.siFalta ?? {}) },
  saludo: { manana: c.saludo?.manana ?? "", tarde: c.saludo?.tarde ?? "", noche: c.saludo?.noche ?? "" },
});

/** «Catálogo web» → catalogo_web: sin tildes ni espacios, como se escribe entre llaves. */
function claveDe(t: string) {
  return t
    .toLowerCase()
    .replace(/[áàäâ]/g, "a").replace(/[éèëê]/g, "e").replace(/[íìïî]/g, "i").replace(/[óòöô]/g, "o").replace(/[úùüû]/g, "u")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-zñ0-9_]/g, "")
    .replace(/^[^a-zñ]+/, "")
    .slice(0, 30);
}

const SI_FALTA = [...VARIABLES_CONTACTO, ...VARIABLES_ENVIO.filter(([k]) => k !== "saludo")];

/**
 * Las variables del equipo, para todas las secuencias: agregar propias ({{catalogo}}, {{telefono_ventas}}…),
 * cambiar {{mi_empresa}}, qué se escribe cuando a un contacto le falta un dato y los textos del saludo.
 * Hay uno solo por página: lo abren los chips con «Variables».
 */
export function VariablesDialog({ config, miEmpresa }: { config: Variables; miEmpresa: string }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const base = useMemo(() => desde(config), [config]);
  const [v, setV] = useState<Estado>(base);
  const [nueva, setNueva] = useState({ clave: "", valor: "" });
  const [aviso, setAviso] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const sucio = JSON.stringify(v) !== JSON.stringify(base) || !!(nueva.clave || nueva.valor);

  useEffect(() => {
    const abrir = () => {
      setV(desde(config));
      setNueva({ clave: "", valor: "" });
      setAviso(null);
      dlg.current?.showModal();
    };
    window.addEventListener("dp:variables", abrir);
    return () => window.removeEventListener("dp:variables", abrir);
  }, [config]);

  const cerrar = () => {
    if (sucio && !pending && !window.confirm("¿Cerrar sin guardar los cambios en las variables?")) return;
    dlg.current?.close();
  };

  /** Valida la variable nueva y la suma a la lista; devuelve la lista resultante (o null si hay algo para corregir). */
  const sumarNueva = (): Propia[] | null => {
    if (!nueva.clave && !nueva.valor) return v.propias;
    const clave = claveDe(nueva.clave);
    const error = !clave
      ? "Poné un nombre para la variable."
      : !CLAVE_VALIDA.test(clave)
        ? "El nombre tiene que empezar con una letra."
        : clave === "mi_empresa"
          ? "{{mi_empresa}} ya está arriba: cambiala ahí."
          : RESERVADAS.has(clave)
            ? `{{${clave}}} ya existe: sale de los datos de cada contacto o del envío.`
            : v.propias.some((p) => p.clave === clave)
              ? `Ya tenés {{${clave}}}: cambiale el texto en la lista.`
              : !nueva.valor.trim()
                ? `Escribí qué tiene que decir {{${clave}}}.`
                : "";
    if (error) {
      setAviso({ ok: false, t: error });
      return null;
    }
    const propias = [...v.propias, { clave, valor: nueva.valor.trim() }];
    setV({ ...v, propias });
    setNueva({ clave: "", valor: "" });
    setAviso(null);
    return propias;
  };

  const guardar = () => {
    const propias = sumarNueva();
    if (!propias) return;
    if (propias.some((p) => !p.valor.trim())) return setAviso({ ok: false, t: "Hay una variable sin texto: escribile qué dice o borrala." });
    start(async () => {
      const r = await guardarVariables({
        propias: [...(v.mi.trim() ? [{ clave: "mi_empresa", valor: v.mi.trim() }] : []), ...propias],
        siFalta: v.siFalta,
        saludo: v.saludo,
      });
      if ("error" in r) return setAviso({ ok: false, t: r.error });
      setAviso({ ok: true, t: "✓ Variables guardadas: ya podés usarlas en todos los pasos." });
      setTimeout(() => dlg.current?.close(), 1400);
    });
  };

  // En el teléfono: la variable arriba y su texto (con el tacho) abajo; en pantallas anchas, todo en una fila.
  const fila = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 sm:grid-cols-[150px_minmax(0,1fr)_auto]";
  return (
    <dialog
      ref={dlg}
      className="dlg max-w-[640px]"
      aria-labelledby="variables-t"
      onCancel={(e) => {
        e.preventDefault();
        cerrar();
      }}
      onClick={(e) => e.target === dlg.current && cerrar()}
    >
      <header className="flex items-start justify-between gap-3 border-b border-line/60 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <h2 id="variables-t">Variables</h2>
          <p className="text-[13px] text-muted">
            Se escriben entre llaves dobles, como <code className="font-mono text-ink">{"{{empresa}}"}</code>. Lo que cambies acá vale para todas las secuencias.
          </p>
        </div>
        <BotonCerrar onClick={cerrar} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4">
        <section className="flex flex-col gap-2.5" aria-labelledby="var-propias">
          <div>
            <h3 id="var-propias" className="eyebrow">Tuyas</h3>
            <p className="text-[13px] text-muted">Un texto fijo que se escribe igual para todos: un link, un teléfono, una promo.</p>
          </div>
          <div className={fila}>
            <code className="chip col-span-2 w-fit font-mono sm:col-span-1">{"{{mi_empresa}}"}</code>
            <input
              aria-label="Texto de {{mi_empresa}}"
              value={v.mi}
              onChange={(e) => setV({ ...v, mi: e.target.value })}
              placeholder={miEmpresa}
              maxLength={500}
              className="input col-span-2 sm:col-span-1"
            />
            <span className="hidden w-8 sm:block" />
          </div>
          {v.propias.map((p, i) => (
            <div key={p.clave} className={fila}>
              <code className="chip col-span-2 w-fit bg-brand/[.12] font-mono text-brand-2 ring-brand/25 sm:col-span-1">{`{{${p.clave}}}`}</code>
              <input
                aria-label={`Texto de {{${p.clave}}}`}
                value={p.valor}
                onChange={(e) => setV({ ...v, propias: v.propias.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)) })}
                maxLength={500}
                className="input"
              />
              <button
                type="button"
                onClick={() => setV({ ...v, propias: v.propias.filter((_, j) => j !== i) })}
                aria-label={`Borrar {{${p.clave}}}`}
                title="Borrar variable"
                className="grid h-8 w-8 place-items-center justify-self-end rounded-full text-[#FF8F8F] transition hover:bg-[#FF6F6F]/[.12]"
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l1 12.5h9l1-12.5M10 11v5.5M14 11v5.5" />
                </svg>
              </button>
            </div>
          ))}
          <div className="well flex flex-col gap-2 p-3">
            <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
              <input
                aria-label="Nombre de la variable nueva"
                value={nueva.clave}
                onChange={(e) => {
                  setNueva({ ...nueva, clave: e.target.value });
                  if (aviso && !aviso.ok) setAviso(null);
                }}
                placeholder="ej. catalogo"
                maxLength={40}
                className="input font-mono"
              />
              <input
                aria-label="Texto de la variable nueva"
                value={nueva.valor}
                onChange={(e) => {
                  setNueva({ ...nueva, valor: e.target.value });
                  if (aviso && !aviso.ok) setAviso(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), sumarNueva())}
                placeholder="qué escribe: un link, un teléfono, una promo…"
                maxLength={500}
                className="input"
              />
              <button type="button" onClick={sumarNueva} className="btn-ghost">Agregar</button>
            </div>
            {nueva.clave && claveDe(nueva.clave) && (
              <p className="text-xs text-muted">
                Se va a escribir <code className="font-mono text-ink">{`{{${claveDe(nueva.clave)}}}`}</code>
              </p>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2.5" aria-labelledby="var-falta">
          <div>
            <h3 id="var-falta" className="eyebrow">Si falta el dato</h3>
            <p className="text-[13px] text-muted">
              Qué se escribe cuando el contacto no tiene ese dato (vacío: no se escribe nada). Para un mensaje puntual también podés poner <code className="font-mono text-ink">{"{{nombre|equipo}}"}</code>.
            </p>
          </div>
          <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
            {SI_FALTA.map(([k, ayuda]) => (
              <label key={k} className="flex min-w-0 flex-col gap-1">
                <span className="flex min-w-0 items-baseline gap-2 text-[13px]">
                  <code className="font-mono text-ink">{`{{${k}}}`}</code>
                  <span className="truncate text-faint">{ayuda}</span>
                </span>
                <input
                  value={v.siFalta[k] ?? ""}
                  onChange={(e) => setV({ ...v, siFalta: { ...v.siFalta, [k]: e.target.value } })}
                  placeholder="queda vacío"
                  maxLength={120}
                  className="input"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2.5" aria-labelledby="var-saludo">
          <div>
            <h3 id="var-saludo" className="eyebrow">Saludo</h3>
            <p className="text-[13px] text-muted">
              <code className="font-mono text-ink">{"{{saludo}}"}</code> cambia solo según la hora del envío. Escribí cómo lo dicen ustedes.
            </p>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {(
              [
                ["manana", "Mañana (6 a 13 h)", "Buenos días"],
                ["tarde", "Tarde (13 a 20 h)", "Buenas tardes"],
                ["noche", "Noche", "Buenas noches"],
              ] as const
            ).map(([k, t, ph]) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-[13px] text-muted">{t}</span>
                <input value={v.saludo[k]} onChange={(e) => setV({ ...v, saludo: { ...v.saludo, [k]: e.target.value } })} placeholder={ph} maxLength={40} className="input" />
              </label>
            ))}
          </div>
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line/60 px-5 py-3">
        {aviso && (
          <span role="status" className={`mr-auto text-[13px] font-medium ${aviso.ok ? "text-[#7BE3B4]" : "text-[#FF9A9A]"}`}>
            {aviso.t}
          </span>
        )}
        {!aviso && sucio && <span className="mr-auto text-xs font-medium text-[#FFD587]">Cambios sin guardar</span>}
        <button type="button" className="btn-ghost" onClick={cerrar}>Cancelar</button>
        <button type="button" className={aviso?.ok ? "btn-wa" : "btn"} disabled={pending || (!sucio && !aviso?.ok)} onClick={guardar}>
          {pending ? "Guardando…" : aviso?.ok ? "✓ Guardadas" : "Guardar"}
        </button>
      </footer>
    </dialog>
  );
}
