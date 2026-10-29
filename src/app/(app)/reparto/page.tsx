import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { usuarioActual, primerNombre } from "@/lib/usuario";
import { senderConnected } from "@/lib/mailer";
import { waApiReady } from "@/lib/whatsapp-api";
import { sentToday, todayStart } from "@/lib/quota";
import { cargadosHoy, disponibles, ahoraAR } from "@/lib/reparto";
import { PageHeader, Pill, Avatar } from "@/components/ui";
import { Switch } from "@/components/Switch";
import { BotonGuardar } from "@/components/BotonGuardar";
import { toggleReparto, toggleRemitente, guardarTopes, repartirAhora } from "./actions";

export const metadata = { title: "Reparto diario" };
export const dynamic = "force-dynamic";

/**
 * El reparto diario: cada día hábil a las 8, cada remitente recibe sus contactos nuevos al azar y entran a su
 * secuencia de mails y a la de WhatsApp. Solo el administrador lo ve y lo maneja.
 */
export default async function Reparto() {
  const u = await usuarioActual();
  if (!u.admin) redirect("/");
  const hoy = todayStart();
  const [setting, senders, libres, enviados, waApi, waTareas] = await Promise.all([
    db.setting.findUnique({ where: { id: "app" }, select: { repartoOn: true, repartoUltimo: true } }),
    db.sender.findMany({ orderBy: { name: "asc" } }),
    disponibles(),
    sentToday(),
    db.waMessage.groupBy({ by: ["senderId"], where: { sentAt: { gte: hoy }, error: null }, _count: true }),
    db.task.findMany({ where: { kind: "WHATSAPP", createdAt: { gte: hoy } }, select: { enrollment: { select: { sequence: { select: { senderId: true } } } } } }),
  ]);
  const cargados = await cargadosHoy(senders);
  const seqIds = senders.flatMap((s) => [s.seqMailId, s.seqWaId]).filter((x): x is string => !!x);
  const seqs = new Map((await db.sequence.findMany({ where: { id: { in: seqIds } }, select: { id: true, name: true, sendingOn: true } })).map((q) => [q.id, q]));
  const waHoy = (id: string) =>
    (waApi.find((r) => r.senderId === id)?._count ?? 0) + waTareas.filter((t) => t.enrollment.sequence.senderId === id).length;
  const on = !!setting?.repartoOn;
  const yaHoy = setting?.repartoUltimo === ahoraAR().fecha;
  const participan = senders.filter((s) => s.repartoOn);

  return (
    <>
      <PageHeader
        title="Reparto diario"
        sub="Cada día hábil a las 8 de la mañana, cada remitente recibe sus contactos nuevos al azar y entran a su secuencia de mails y a la de WhatsApp."
      />

      <section className="card appear flex flex-col gap-4 p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white">Reparto automático de las 8</p>
            <p className="mt-1 text-sm text-muted">
              {on
                ? yaHoy
                  ? "Encendido. Hoy ya se repartió; el próximo es el próximo día hábil a las 8."
                  : "Encendido. Se reparte en la primera pasada del programador desde las 8."
                : "Apagado. Encendelo cuando las secuencias de cada remitente estén revisadas."}{" "}
              Repartir no envía nada: los mensajes salen solo cuando encendés la secuencia de cada remitente.
            </p>
          </div>
          <Switch on={on} action={toggleReparto.bind(null, !on)} label={on ? "Apagar el reparto" : "Encender el reparto"} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Pill tone="info">{libres.toLocaleString("es-AR")} contactos disponibles para repartir</Pill>
          <Pill tone="neutral">{participan.length} remitentes participan</Pill>
          <form action={repartirAhora} className="ml-auto">
            <button className="btn-ghost" disabled={!participan.length}>Repartir ahora lo que falta de hoy</button>
          </form>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted">
          <li>Primero recibe los contactos suyos que todavía no estuvieron en ninguna secuencia; el resto, al azar entre los libres.</li>
          <li>Cada contacto queda como cliente de quien lo recibe: nadie más le escribe.</li>
          <li>Un contacto que ya recibió una secuencia solo lo puede volver a recibir <b className="text-ink">otro remitente</b>, una semana después de que terminó. Si respondió, pidió la baja o rebotó, no vuelve a entrar.</li>
          <li>Los WhatsApp salen solos cuando el número del remitente está conectado a la API de WhatsApp; mientras tanto quedan en Tareas con el mensaje listo, con el mismo tope diario.</li>
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {senders.map((s) => {
          const mail = s.seqMailId ? seqs.get(s.seqMailId) : undefined;
          const wa = s.seqWaId ? seqs.get(s.seqWaId) : undefined;
          const mailsHoy = enviados.byMailbox.get(s.email.toLowerCase()) ?? 0;
          return (
            <section key={s.id} className="card appear flex flex-col gap-4 p-5">
              <div className="flex items-center gap-3">
                <Avatar name={s.name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{s.name}</p>
                  <p className="truncate text-xs text-faint">{s.email}</p>
                </div>
                <Switch
                  on={s.repartoOn}
                  action={toggleRemitente.bind(null, s.id, !s.repartoOn)}
                  label={s.repartoOn ? `Sacar a ${primerNombre(s.name)} del reparto` : `Sumar a ${primerNombre(s.name)} al reparto`}
                  size="sm"
                />
              </div>

              {s.repartoOn ? (
                <>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <Pill tone="neutral">Hoy recibió {cargados.get(s.id) ?? 0} de {s.repartoDia}</Pill>
                    <Pill tone="neutral">{mailsHoy} de {s.dailyLimit} mails</Pill>
                    <Pill tone="neutral">{waHoy(s.id)} de {s.waDailyLimit} WhatsApp</Pill>
                    {!senderConnected(s) && <Pill tone="bad">Gmail sin conectar</Pill>}
                    {!waApiReady(s) && <Pill tone="warn">WhatsApp a mano (Tareas)</Pill>}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      ["Secuencia de mails", mail],
                      ["Secuencia de WhatsApp", wa],
                    ].map(([t, q]) =>
                      q && typeof q === "object" ? (
                        <Link key={String(t)} href={`/secuencias/${q.id}?tab=pasos`} className="flex items-center justify-between gap-2 rounded-2xl bg-white/[.04] px-3 py-2.5 ring-1 ring-white/[.08] transition hover:bg-white/[.07]">
                          <span className="min-w-0">
                            <span className="block text-[13px] font-medium text-white">{String(t)}</span>
                            <span className="block truncate text-[11px] text-faint">Revisar textos y encender</span>
                          </span>
                          <Pill tone={q.sendingOn ? "ok" : "neutral"}>{q.sendingOn ? "Encendida" : "Apagada"}</Pill>
                        </Link>
                      ) : null,
                    )}
                  </div>
                  <form action={guardarTopes.bind(null, s.id)} className="grid grid-cols-3 gap-2">
                    <input type="hidden" name="_guardar" value="1" />
                    <label className="flex flex-col gap-1">
                      <span className="label">Contactos por día</span>
                      <input name="repartoDia" type="number" min={0} max={500} defaultValue={s.repartoDia} className="input" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="label">Mails por día</span>
                      <input name="dailyLimit" type="number" min={1} max={500} defaultValue={s.dailyLimit} className="input" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="label">WhatsApp por día</span>
                      <input name="waDailyLimit" type="number" min={0} max={500} defaultValue={s.waDailyLimit} className="input" />
                    </label>
                    <div className="col-span-3">
                      <BotonGuardar className="btn-ghost">Guardar topes</BotonGuardar>
                    </div>
                  </form>
                </>
              ) : (
                <p className="text-xs text-muted">No participa. Al sumarlo se le arman sus dos secuencias (apagadas) con topes de 100 contactos, 100 mails y 40 WhatsApp por día.</p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
