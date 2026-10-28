/**
 * Bot de WhatsApp (parte sin base de datos, para poder probarla).
 * Meta avisa cada mensaje nuevo al webhook /api/whatsapp; acá se lee ese aviso, se comprueba que
 * venga de Meta y se arma la conversación que se le pasa a Claude para contestar.
 * El bot solo contesta si WHATSAPP_BOT dice «encendido» (además del token de WhatsApp).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type WaEntrante = {
  phoneNumberId: string;
  /** Número del cliente, como lo manda Meta (549…). */
  from: string;
  name: string;
  wamid: string;
  /** Texto del mensaje; en audios, fotos, etc. queda vacío y `type` dice qué era. */
  text: string;
  type: string;
  at: Date;
};

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => (x && typeof x === "object" ? (x as Obj) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown) => (typeof x === "string" ? x : "");

/** Mensajes nuevos de un aviso de Meta. Ignora los avisos de entregado/leído. */
export function leerAviso(body: unknown): WaEntrante[] {
  const out: WaEntrante[] = [];
  for (const entry of arr(obj(body).entry)) {
    for (const change of arr(obj(entry).changes)) {
      const value = obj(obj(change).value);
      const phoneNumberId = str(obj(value.metadata).phone_number_id);
      const names = new Map(arr(value.contacts).map((c) => [str(obj(c).wa_id), str(obj(obj(c).profile).name)]));
      for (const m of arr(value.messages)) {
        const o = obj(m);
        const type = str(o.type);
        const text =
          type === "text" ? str(obj(o.text).body)
          : type === "button" ? str(obj(o.button).text)
          : type === "interactive" ? str(obj(obj(o.interactive).button_reply).title) || str(obj(obj(o.interactive).list_reply).title)
          : str(obj(o[type]).caption);
        const from = str(o.from);
        const wamid = str(o.id);
        if (!from || !wamid || !phoneNumberId) continue;
        const ts = Number(str(o.timestamp));
        out.push({ phoneNumberId, from, name: names.get(from) ?? "", wamid, text: text.trim(), type, at: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : new Date() });
      }
    }
  }
  return out;
}

/** Meta firma cada aviso con el «secreto de la app» (cabecera X-Hub-Signature-256). */
export function firmaValida(raw: string, header: string | null, secret: string) {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(raw, "utf8").digest("hex"));
  const got = Buffer.from(header.slice(7));
  return got.length === want.length && timingSafeEqual(got, want);
}

export function botEncendido() {
  return process.env.WHATSAPP_BOT === "encendido" && !!process.env.WHATSAPP_TOKEN;
}

type Linea = { direction: string; by: string; body: string; at: Date };

/** Horas que el bot se calla después de que una persona contestó desde Dartpac. */
export const PAUSA_PERSONA_H = 12;

export function botEnPausa(historial: Linea[], ahora = new Date()) {
  return historial.some((l) => l.by === "persona" && ahora.getTime() - l.at.getTime() < PAUSA_PERSONA_H * 3600_000);
}

/** Meta deja mandar texto libre solo hasta 24 h después del último mensaje del cliente. */
export function ventanaAbierta(historial: Linea[], ahora = new Date()) {
  const ultima = historial.filter((l) => l.direction === "in").reduce((t, l) => Math.max(t, l.at.getTime()), 0);
  return ultima > 0 && ahora.getTime() - ultima < 24 * 3600_000;
}

export const SALUDO_POR_DEFECTO =
  "¡Hola! Gracias por escribir a Plupack Embalajes. Recibimos tu mensaje y en breve te responde un asesor (lunes a viernes de 8 a 19 h).";

export function instruccionesBot(info: string) {
  return [
    "Sos el asistente de WhatsApp de Plupack Embalajes, una empresa argentina que vende embalajes a otras empresas.",
    "Respondés consultas de clientes potenciales en español rioplatense (vos), con tono cordial y profesional, en mensajes cortos de WhatsApp: 1 a 4 oraciones, sin títulos ni listas largas.",
    "Usá solo la información del negocio que está abajo. Si te preguntan algo que no está (precios exactos, stock, plazos, descuentos), no lo inventes: pedí los datos que hagan falta (producto o medida, cantidad, localidad) y decí que un asesor le confirma a la brevedad.",
    "Si el cliente pide hablar con una persona, está molesto o quiere cerrar una compra, decile que un asesor lo contacta en breve.",
    "No prometas nada que la información no diga. Nunca pidas datos de tarjetas ni contraseñas.",
    "",
    "Información del negocio:",
    info.trim() || "(todavía no se cargó información: solo saludá, pedí qué necesita y avisá que un asesor responde en breve)",
  ].join("\n");
}

/** Los últimos mensajes como conversación para Claude: empieza por el cliente y junta los seguidos del mismo lado. */
export function conversacionBot(historial: Linea[], max = 20) {
  const turnos: { role: "user" | "assistant"; content: string }[] = [];
  for (const l of [...historial].sort((a, b) => a.at.getTime() - b.at.getTime()).slice(-max)) {
    const role = l.direction === "in" ? "user" : "assistant";
    const body = l.body.trim();
    if (!body) continue;
    const last = turnos.at(-1);
    if (last?.role === role) last.content += "\n" + body;
    else turnos.push({ role, content: body });
  }
  while (turnos[0]?.role === "assistant") turnos.shift();
  return turnos;
}
