"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { abrirWhatsapp, vistaWhatsapp, type VistaWa } from "@/app/(app)/contactos/whatsapp-actions";

const WA_ICON = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4.3 19.7l1.1-3.9A8.2 8.2 0 1 1 8.6 19zM9 8.6c.2 2.9 3.4 6.1 6.4 6.4l1.1-1.4-2-1-.9.8c-1-.4-2.1-1.5-2.5-2.5l.8-.9-1-2z" />
  </svg>
);

/**
 * Botón de WhatsApp de cada contacto: muestra el mensaje listo (firmado por quien escribe), se puede editar y abre el
 * chat en el WhatsApp de esa persona. Enviar lo hace ella desde su WhatsApp: acá no sale nada solo.
 */
export function WhatsappContacto({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const [v, setV] = useState<VistaWa | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function cargar(remitenteId?: string) {
    setError("");
    const r = await vistaWhatsapp(id, remitenteId).catch(() => ({ error: "Se cortó la conexión. Probá de nuevo." }) as VistaWa);
    setV(r);
    setTexto(r.texto ?? "");
  }
  async function abrir() {
    setV(null);
    dlg.current?.showModal();
    await cargar();
  }
  async function enviar() {
    // la pestaña se abre ya (si no, el navegador la bloquea) y se completa cuando vuelve el enlace
    const w = window.open("", "_blank");
    setOcupado(true);
    const r = await abrirWhatsapp(id, texto, v?.remitenteId).catch(() => ({ error: "Se cortó la conexión. Probá de nuevo." }) as { link?: string; error?: string });
    setOcupado(false);
    if (r.error || !r.link) {
      w?.close();
      setError(r.error ?? "No se pudo abrir WhatsApp.");
      return;
    }
    if (w) w.location.href = r.link;
    else window.location.href = r.link;
    dlg.current?.close();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="grid h-8 w-8 place-items-center rounded-lg text-[#62E6AE] transition hover:bg-ok/15 hover:text-white"
        aria-label={`Escribirle por WhatsApp a ${nombre}`}
        title="Escribirle por WhatsApp desde tu número"
      >
        {WA_ICON}
      </button>
      <dialog ref={dlg} className="card whitespace-normal w-[min(520px,calc(100vw-32px))] p-0 text-ink backdrop:bg-black/60" onClose={() => setError("")}>
        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[17px] font-semibold text-white">WhatsApp a {nombre}</h2>
            <button type="button" onClick={() => dlg.current?.close()} className="text-muted hover:text-white" aria-label="Cerrar">✕</button>
          </div>
          {!v ? (
            <p className="text-sm text-muted">Preparando el mensaje…</p>
          ) : (
            <>
              {v.remitentes && (
                <div>
                  <label htmlFor={`wa-de-${id}`} className="label">Escribe</label>
                  <select id={`wa-de-${id}`} className="input" value={v.remitenteId ?? ""} onChange={(e) => cargar(e.target.value)}>
                    {v.remitentes.map((r) => (
                      <option key={r.id} value={r.id}>{r.nombre}{r.whatsapp ? ` · ${r.whatsapp}` : " · sin WhatsApp cargado"}</option>
                    ))}
                  </select>
                </div>
              )}
              {v.error ? (
                <p className="rounded-lg bg-bad/15 px-3 py-2 text-sm text-[#FF9A9A]">
                  {v.error} {v.error.includes("Remitentes") && <a href="/remitentes" className="font-medium text-white underline">Ir a Remitentes</a>}
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted">
                    Para {v.numero}{v.de ? ` · desde el WhatsApp de ${v.de.nombre.split(/\s+/)[0]} (${v.de.whatsapp})` : ""}
                  </p>
                  <label htmlFor={`wa-tx-${id}`} className="label">Mensaje (lo podés cambiar)</label>
                  <textarea id={`wa-tx-${id}`} rows={7} className="input min-h-[150px]" value={texto} onChange={(e) => setTexto(e.target.value)} />
                  {error && <p className="text-sm text-[#FF9A9A]">{error}</p>}
                  <button type="button" className="btn justify-center" style={{ background: "linear-gradient(#25C063, #1A9E4F)" }} disabled={ocupado || !texto.trim()} onClick={enviar}>
                    {ocupado ? "Abriendo…" : "Abrir en mi WhatsApp"}
                  </button>
                  <p className="text-xs text-muted">Se abre el chat con el mensaje escrito. Lo mandás vos desde tu WhatsApp: acá no se envía nada solo. Abrí WhatsApp Web o la app con tu número.</p>
                </>
              )}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
