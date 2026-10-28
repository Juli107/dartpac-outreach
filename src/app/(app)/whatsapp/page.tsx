import Link from "next/link";
import { db } from "@/lib/db";
import { relativeTime } from "@/lib/labels";
import type { Check } from "@/lib/health";
import { botEncendido, botEnPausa, ventanaAbierta, PAUSA_PERSONA_H, SALUDO_POR_DEFECTO } from "@/lib/whatsapp-bot";
import { PageHeader, Empty, Flash, CheckList, Avatar, Pill } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { BotonGuardar } from "@/components/BotonGuardar";
import { guardarBot, responderWa } from "./actions";

export const metadata = { title: "WhatsApp" };

async function refrescar() {
  "use server";
  return { checked: true };
}

const QUIEN: Record<string, string> = { bot: "Bot", persona: "Persona" };

export default async function WhatsApp({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const [ultimos, ajustes, numeros] = await Promise.all([
    db.waChat.findMany({ orderBy: { at: "desc" }, take: 500 }),
    db.setting.findUnique({ where: { id: "app" }, select: { botInfo: true, botSaludo: true } }),
    db.sender.count({ where: { waPhoneNumberId: { not: "" } } }),
  ]);
  const chats = new Map<string, (typeof ultimos)[number] & { nombre: string }>();
  for (const m of ultimos) {
    const ya = chats.get(m.waId);
    if (!ya) chats.set(m.waId, { ...m, nombre: m.name });
    else if (!ya.nombre && m.name) ya.nombre = m.name;
  }
  const abierto = c ? await db.waChat.findMany({ where: { waId: c }, orderBy: { at: "asc" }, take: 300 }) : [];
  const nombreAbierto = (c && chats.get(c)?.nombre) || (c ? `+${c}` : "");
  const ahora = new Date();

  const env = (k: string) => !!process.env[k];
  const checks: Check[] = [
    { level: numeros ? "ok" : "warn", title: numeros ? "Número de la API cargado en Remitentes" : "Falta cargar el ID del número de Meta", detail: numeros ? undefined : "Se pone en Remitentes, en «ID del número en Meta»." },
    { level: env("WHATSAPP_TOKEN") ? "ok" : "warn", title: env("WHATSAPP_TOKEN") ? "Token de WhatsApp cargado" : "Falta WHATSAPP_TOKEN en Vercel" },
    { level: env("WHATSAPP_APP_SECRET") && env("WHATSAPP_VERIFY_TOKEN") ? "ok" : "warn", title: env("WHATSAPP_APP_SECRET") && env("WHATSAPP_VERIFY_TOKEN") ? "Webhook listo para recibir mensajes" : "Faltan WHATSAPP_APP_SECRET y WHATSAPP_VERIFY_TOKEN en Vercel", detail: `URL para Meta: ${process.env.APP_URL ?? "https://outreach.plupackembalajes.com"}/api/whatsapp` },
    { level: env("ANTHROPIC_API_KEY") ? "ok" : "info", title: env("ANTHROPIC_API_KEY") ? "El bot responde con IA (Claude)" : "Sin ANTHROPIC_API_KEY: el bot solo manda el saludo fijo" },
    { level: botEncendido() ? "ok" : "off", title: botEncendido() ? "Bot encendido: contesta solo" : "Bot apagado", detail: botEncendido() ? `Se calla ${PAUSA_PERSONA_H} h en un chat cuando una persona contesta desde acá.` : "Se enciende con WHATSAPP_BOT=encendido en Vercel, solo con permiso de Julián." },
  ];

  return (
    <>
      <PageHeader title="WhatsApp" sub="Consultas que llegan al número de la API, lo que contesta el bot y lo que contestan ustedes.">
        <AutoRefresh action={refrescar} seconds={20} />
      </PageHeader>

      <section className="card appear min-w-0 overflow-hidden">
        <h2 className="px-5 pt-4 font-semibold">Estado</h2>
        <CheckList checks={checks} />
      </section>

      <section className="card appear grid min-w-0 overflow-hidden md:grid-cols-[280px_1fr]">
        {chats.size === 0 ? (
          <div className="md:col-span-2">
            <Empty title="Todavía no hay conversaciones">Cuando un cliente escriba al número de la API, aparece acá y en la Bandeja.</Empty>
          </div>
        ) : (
          <>
            <ul className="max-h-[560px] overflow-y-auto border-b border-line/60 md:border-b-0 md:border-r">
              {[...chats.values()].map((m) => (
                <li key={m.waId}>
                  <Link href={`/whatsapp?c=${m.waId}`} className={`flex gap-3 px-4 py-3 transition hover:bg-white/[.05] ${c === m.waId ? "bg-brand/[.12]" : ""}`}>
                    <Avatar name={m.nombre || m.waId} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2"><b className="truncate">{m.nombre || `+${m.waId}`}</b><span className="shrink-0 text-xs text-muted">{relativeTime(m.at)}</span></div>
                      <p className="truncate text-[13px] text-muted">{m.direction === "out" ? `${QUIEN[m.by] ?? "Ustedes"}: ` : ""}{m.body}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex min-w-0 flex-col">
              {!c ? (
                <Empty title="Elegí una conversación">A la izquierda están los chats, del más reciente al más viejo.</Empty>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 border-b border-line/60 px-5 py-3">
                    <b>{nombreAbierto}</b>
                    <span className="text-xs text-muted">+{c}{botEnPausa(abierto, ahora) ? " · bot en pausa" : ""}</span>
                  </div>
                  <ol className="grid max-h-[460px] gap-2 overflow-y-auto px-5 py-4">
                    {abierto.map((m) => (
                      <li key={m.id} className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${m.direction === "in" ? "justify-self-start bg-white/[.06]" : "justify-self-end bg-brand/[.22]"}`}>
                        {m.direction === "out" && <div className="text-[11px] font-semibold text-muted">{QUIEN[m.by] ?? m.by}</div>}
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <div className="mt-0.5 flex gap-2 text-[11px] text-muted">
                          <span>{relativeTime(m.at)}</span>
                          {m.error && <Pill tone="bad" title={m.error}>No salió</Pill>}
                        </div>
                      </li>
                    ))}
                  </ol>
                  {ventanaAbierta(abierto, ahora) ? (
                    <form action={responderWa.bind(null, c)} className="flex gap-2 border-t border-line/60 px-5 py-3">
                      <textarea name="texto" rows={2} required className="input flex-1" placeholder="Escribí la respuesta…" aria-label="Respuesta" />
                      <BotonGuardar listo="Enviado" enviando="Enviando…" avisarCambios={false}>Enviar</BotonGuardar>
                    </form>
                  ) : (
                    <p className="border-t border-line/60 px-5 py-3 text-[13px] text-muted">Pasaron más de 24 h desde su último mensaje: Meta solo deja escribirle con una plantilla aprobada.</p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </section>

      <section className="card appear min-w-0">
        <form action={guardarBot} className="grid gap-4 p-5">
          <div>
            <h2 className="font-semibold">Qué sabe el bot</h2>
            <p className="text-[13px] text-muted">Productos, medidas, precios orientativos, envíos, formas de pago, horario. El bot responde solo con esto; lo que no sepa lo deja para un asesor.</p>
          </div>
          <textarea name="botInfo" rows={10} defaultValue={ajustes?.botInfo ?? ""} className="input" placeholder={"Ej.: Vendemos cajas de cartón corrugado, film stretch, cinta, esquineros…\nPedido mínimo: …\nEnvíos: …\nPago: transferencia…"} aria-label="Información del negocio" />
          <label className="grid gap-1.5">
            <span className="font-medium">Saludo fijo</span>
            <span className="text-[13px] text-muted">Se manda cuando el bot no puede usar la IA (sin clave o si el mensaje es un audio o una foto). Una vez por día y cliente.</span>
            <textarea name="botSaludo" rows={3} defaultValue={ajustes?.botSaludo ?? ""} placeholder={SALUDO_POR_DEFECTO} className="input" />
          </label>
          {!botEncendido() && <Flash tone="info">El bot está apagado: guardar esto no manda nada.</Flash>}
          <div className="flex items-center justify-end gap-3"><BotonGuardar>Guardar</BotonGuardar></div>
        </form>
      </section>
    </>
  );
}
