/**
 * Envío automático de WhatsApp por la API oficial de Meta (WhatsApp Cloud API).
 * Doble llave para que nada salga sin permiso: la variable WHATSAPP_ENVIO tiene que decir
 * «encendido» y, además, la secuencia tiene que estar encendida (como con los emails).
 * El primer mensaje a alguien que no escribió antes solo puede ser una plantilla aprobada por Meta.
 */
const GRAPH = "https://graph.facebook.com/v21.0";

export function waApiReady(sender: { waPhoneNumberId: string } | null | undefined) {
  return process.env.WHATSAPP_ENVIO === "encendido" && !!process.env.WHATSAPP_TOKEN && !!sender?.waPhoneNumberId;
}

/** «{{nombre}}, {{mi_nombre}}» → ["{{nombre}}", "{{mi_nombre}}"]: lo que va en {{1}}, {{2}}… */
export function waParamList(s: string) {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

/** Manda una plantilla y devuelve el id del mensaje (wamid). Si Meta lo rechaza, tira el error con su motivo. */
export async function sendWaTemplate(o: { phoneNumberId: string; to: string; template: string; lang: string; params: string[] }) {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(o.phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: o.to,
      type: "template",
      template: {
        name: o.template,
        language: { code: o.lang || "es_AR" },
        // Meta no acepta textos vacíos en las variables
        ...(o.params.length ? { components: [{ type: "body", parameters: o.params.map((t) => ({ type: "text", text: t.trim() || "-" })) }] } : {}),
      },
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
  if (!res.ok || !j.messages?.[0]?.id) throw new Error(`WhatsApp: ${j.error?.message ?? `error ${res.status}`}${j.error?.code ? ` (código ${j.error.code})` : ""}`);
  return j.messages[0].id;
}

/** Manda un texto libre. Meta solo lo acepta dentro de las 24 h desde el último mensaje del cliente. */
export async function sendWaText(o: { phoneNumberId: string; to: string; text: string }) {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(o.phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: o.to, type: "text", text: { body: o.text.slice(0, 4096) } }),
  });
  const j = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
  if (!res.ok || !j.messages?.[0]?.id) throw new Error(`WhatsApp: ${j.error?.message ?? `error ${res.status}`}${j.error?.code ? ` (código ${j.error.code})` : ""}`);
  return j.messages[0].id;
}
