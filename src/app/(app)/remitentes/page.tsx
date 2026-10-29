import { db } from "@/lib/db";
import { sentToday } from "@/lib/quota";
import { renderSignature, soloImagen, type SignatureSender } from "@/lib/signature";
import { PageHeader, Pill, Avatar, Flash, ProgressBar, Dot } from "@/components/ui";
import { relativeTime } from "@/lib/labels";
import { googleConfigured } from "@/lib/google";
import { BotonGuardar } from "@/components/BotonGuardar";
import { createSender, updateSender, disconnectSender, disconnectGoogle, deleteSender, testSender, removeSignatureImage } from "./actions";

export const metadata = { title: "Remitentes" };

type SenderFields = Partial<SignatureSender> & { whatsapp?: string; waPhoneNumberId?: string; waDailyLimit?: number; dailyLimit?: number; hasPassword?: boolean; hasImage?: boolean; viaGoogle?: boolean };

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="16" height="16" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.2z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** Enlace que lleva a Google para conectar el Gmail (de un remitente o de uno nuevo). */
function GoogleButton({ senderId, children }: { senderId?: string; children: React.ReactNode }) {
  const href = `/api/google/start?modo=conectar${senderId ? `&remitente=${senderId}` : ""}`;
  return (
    <a href={href} className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-3.5 py-1.5 font-semibold text-[#1F1F1F] shadow-sm transition hover:bg-[#EEF3FA] active:scale-[.97]">
      <GoogleIcon />
      {children}
    </a>
  );
}

/** Una de las dos formas de usar la imagen en la firma, con un dibujito de cómo queda. */
function ModoFirma({ prefix, value, checked, titulo, detalle, children }: { prefix: string; value: string; checked: boolean; titulo: string; detalle: string; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white/[.04] p-3 ring-1 ring-white/[.08] transition hover:bg-white/[.07] has-[:checked]:bg-brand/[.14] has-[:checked]:ring-brand/40">
      <input type="radio" name="signatureImageMode" value={value} defaultChecked={checked} id={`${prefix}-modo-${value}`} className="mt-1 h-4 w-4 shrink-0 accent-[#4DA3FF]" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">{titulo}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted">{detalle}</span>
      </span>
      <svg viewBox="0 0 40 28" width="40" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="mt-0.5 shrink-0 text-brand-2" aria-hidden>
        {children}
      </svg>
    </label>
  );
}

function Fields({ s, prefix }: { s: SenderFields; prefix: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor={`${prefix}-name`} className="label">Nombre</label>
        <input id={`${prefix}-name`} name="name" required defaultValue={s.name} className="input" />
      </div>
      <div>
        <label htmlFor={`${prefix}-email`} className="label">Email</label>
        <input id={`${prefix}-email`} name="email" type="email" required defaultValue={s.email} className="input" />
      </div>
      <div>
        <label htmlFor={`${prefix}-limit`} className="label">Máximo de emails al día</label>
        <input id={`${prefix}-limit`} name="dailyLimit" type="number" min={1} max={500} required defaultValue={s.dailyLimit ?? 50} className="input" />
      </div>
      <p className="self-end pb-2 text-xs text-muted">Suma de todas sus secuencias. Buzón nuevo: 20–30 la primera semana y sube poco a poco; no pases de 100 en frío.</p>
      <div>
        <label htmlFor={`${prefix}-wa`} className="label">WhatsApp</label>
        <input id={`${prefix}-wa`} name="whatsapp" type="tel" defaultValue={s.whatsapp} placeholder="+54 9 11 0000-0000" className="input" />
      </div>
      <p className="self-end pb-2 text-xs text-muted">El número desde el que escribe por WhatsApp. Con él, en Contactos y en el Radar le escribe a cada cliente con un clic: se abre su WhatsApp con el mensaje listo.</p>
      <div>
        <label htmlFor={`${prefix}-waid`} className="label">ID del número en Meta (para el envío automático)</label>
        <input id={`${prefix}-waid`} name="waPhoneNumberId" inputMode="numeric" defaultValue={s.waPhoneNumberId} placeholder="Phone number ID · solo dígitos" className="input" />
      </div>
      <div>
        <label htmlFor={`${prefix}-walim`} className="label">Máximo de WhatsApp automáticos al día</label>
        <input id={`${prefix}-walim`} name="waDailyLimit" type="number" min={1} max={1000} defaultValue={s.waDailyLimit ?? 20} className="input" />
      </div>
      {s.viaGoogle ? (
        <p className="text-sm text-muted sm:col-span-2">Envía con la conexión de Google: no necesita contraseña de aplicación.</p>
      ) : (
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-pass`} className="label">Contraseña de aplicación de Google {s.hasPassword ? "" : "(o conéctalo con Google)"}</label>
        <input
          id={`${prefix}-pass`}
          name="appPassword"
          type="password"
          autoComplete="new-password"
          placeholder={s.hasPassword ? "Guardada · escribe una nueva solo para cambiarla" : "16 letras, de myaccount.google.com/apppasswords"}
          className="input"
        />
      </div>
      )}

      <h3 className="mt-3 border-t border-line/60 pt-4 font-semibold text-white sm:col-span-2">Firma</h3>
      <div>
        <label htmlFor={`${prefix}-title`} className="label">Cargo</label>
        <input id={`${prefix}-title`} name="jobTitle" defaultValue={s.jobTitle} placeholder="Ejecutivo comercial" className="input" />
      </div>
      <div>
        <label htmlFor={`${prefix}-phone`} className="label">Teléfono</label>
        <input id={`${prefix}-phone`} name="phone" defaultValue={s.phone} placeholder="+54 9 11 0000-0000" className="input" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-web`} className="label">Web</label>
        <input id={`${prefix}-web`} name="website" defaultValue={s.website} placeholder="plupackembalajes.com" className="input" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-img`} className="label">Imagen {s.hasImage ? "(guardada · sube otra para cambiarla)" : "(opcional)"}</label>
        <input id={`${prefix}-img`} name="signatureImage" type="file" accept="image/png,image/jpeg,image/gif" className="input py-1.5" />
        <p className="mt-1 text-xs text-muted">PNG o JPG, máx. 300 KB. Una firma diseñada (con tu nombre y tus datos) de hasta 960 px de ancho, o un logo o una foto.</p>
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="label">Con imagen, la firma lleva</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <ModoFirma prefix={prefix} value="IMAGEN" checked={soloImagen(s.signatureImageMode ?? "IMAGEN")} titulo="Solo la imagen" detalle="No se escribe nada al lado: ni nombre, ni cargo, ni empresa. Para una firma diseñada que ya los trae.">
            <rect x="3" y="7" width="34" height="14" rx="2.5" />
          </ModoFirma>
          <ModoFirma prefix={prefix} value="DATOS" checked={!soloImagen(s.signatureImageMode ?? "IMAGEN")} titulo="La imagen y mis datos al lado" detalle="Para un logo o una foto: al lado van nombre, cargo, empresa, teléfono y web.">
            <rect x="3" y="7" width="12" height="12" rx="2.5" />
            <path d="M20 9h16M20 14h12M20 19h9" />
          </ModoFirma>
        </div>
        <p className="mt-1.5 text-xs text-muted">Sin imagen, la firma lleva tus datos escritos.</p>
      </fieldset>
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-sig`} className="label">Texto extra (opcional)</label>
        <textarea id={`${prefix}-sig`} name="signature" rows={2} defaultValue={s.signature} placeholder="Dirección, horario o una línea legal" className="input font-mono text-[13px]" />
        <p className="mt-1 text-xs text-muted">Va debajo de tus datos. Con «Solo la imagen» no se agrega.</p>
      </div>
    </div>
  );
}

export default async function Senders({
  searchParams,
}: {
  searchParams: Promise<{ prueba?: string; resultado?: string; error?: string; conectado?: string; editar?: string }>;
}) {
  const { prueba, resultado, error, conectado, editar } = await searchParams;
  const google = googleConfigured();
  const senders = await db.sender.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { sequences: true } } } });
  const { byMailbox } = await sentToday();
  const company = process.env.COMPANY_NAME ?? "Plupack Embalajes";
  const tested = senders.find((s) => s.id === prueba);
  return (
    <>
      <PageHeader title="Remitentes" sub="Las personas que envían: cada una desde su Gmail y con su firma.">
        {google && <GoogleButton>Agregar con Google</GoogleButton>}
      </PageHeader>

      {error === "google-sin-configurar" ? (
        <Flash tone="warn">Falta configurar Google: añade GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Vercel.</Flash>
      ) : (
        error && <Flash tone="bad">{error}</Flash>
      )}
      {conectado && <Flash tone="ok">{conectado} quedó conectado con Google. Ninguna secuencia envía hasta que la enciendas.</Flash>}
      {tested && resultado && (
        <Flash tone={resultado === "ok" ? "ok" : "bad"}>
          {resultado === "ok" ? `${tested.name}: conexión correcta. Gmail aceptó las credenciales (no se envió nada).` : `${tested.name}: no se pudo conectar. ${resultado}`}
        </Flash>
      )}

      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {senders.map((s, i) => {
          const today = byMailbox.get(s.email.toLowerCase()) ?? 0;
          const connected = !!(s.googleRefreshToken || s.appPassword);
          const level = !connected || s.lastCheckError ? "bad" : today >= s.dailyLimit ? "warn" : s.lastCheckAt ? "ok" : "info";
          const open = editar === s.id;
          return (
            <section key={s.id} className={`card appear group flex min-w-0 flex-col transition duration-200 hover:shadow-lift ${open ? "md:col-span-2 xl:col-span-3" : ""}`} style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex flex-col items-center gap-3 px-5 pb-4 pt-6 text-center">
                <div className="relative">
                  {/* la foto redonda son siempre las iniciales: la imagen de la firma va solo en la firma */}
                  <Avatar name={s.name} size={72} />
                  <span className="absolute bottom-0.5 right-0.5 rounded-full bg-[#0e2547] p-[3px]"><Dot level={level} /></span>
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-[19px]">{s.name}</h2>
                  <div className="truncate text-[13px] text-muted">{s.jobTitle || "Sin cargo"} · {s.email}</div>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {s.googleRefreshToken ? <Pill tone="ok">Conectado con Google</Pill> : s.appPassword ? <Pill tone="ok">Conectado</Pill> : <Pill tone="warn">Sin conectar</Pill>}
                  <Pill tone="neutral">{s._count.sequences} {s._count.sequences === 1 ? "secuencia" : "secuencias"}</Pill>
                </div>
              </div>

              <div className="px-5">
                <div className="mb-1.5 flex justify-between text-xs text-muted">
                  <span>Enviados hoy</span>
                  <span className="tabular-nums">{today} / {s.dailyLimit}</span>
                </div>
                <ProgressBar value={(today / Math.max(1, s.dailyLimit)) * 100} tone={today >= s.dailyLimit ? "warn" : "brand"} className="w-full" />
                <p className={`mt-3 text-xs ${s.lastCheckError ? "text-[#FF9A9A]" : "text-muted"}`}>
                  {!connected
                    ? "Conéctalo para que pueda enviar."
                    : s.lastCheckError
                      ? `Última comprobación falló: ${s.lastCheckError}`
                      : s.lastCheckAt
                        ? `Conexión comprobada ${relativeTime(s.lastCheckAt)}.`
                        : "Conexión sin comprobar todavía."}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap justify-center gap-2 border-t border-line/60 px-5 py-3">
                <a href={open ? "/remitentes" : `/remitentes?editar=${s.id}#r-${s.id}`} className="btn-ghost">{open ? "Cerrar" : "Editar"}</a>
                {google && !s.googleRefreshToken && <GoogleButton senderId={s.id}>Conectar</GoogleButton>}
                {connected && <form action={testSender.bind(null, s.id)}><button className="btn-ghost" title="No envía nada">Probar conexión</button></form>}
              </div>

              {open && (
                <div id={`r-${s.id}`} className="appear grid scroll-mt-6 gap-6 border-t border-line/60 p-5 lg:grid-cols-[1fr_380px]">
                  <form action={updateSender.bind(null, s.id)}>
                    <Fields s={{ ...s, hasPassword: !!s.appPassword, hasImage: !!s.signatureImageType, viaGoogle: !!s.googleRefreshToken }} prefix={s.id} />
                    <div className="mt-4 flex flex-wrap items-center gap-3"><BotonGuardar>Guardar cambios</BotonGuardar></div>
                  </form>
                  <div className="flex flex-col gap-4">
                    <div className="well p-4">
                      <p className="mb-2 text-xs font-medium text-muted">Así llega</p>
                      <div className="paper p-4">
                        <div className="text-[13px] text-[#5b6b82]">De: <b className="font-semibold text-[#1D1D1F]">{s.name}</b> &lt;{s.email}&gt;</div>
                        <div className="mt-2 text-[13px] text-[#5b6b82]">Saludos,</div>
                        {/* HTML generado por renderSignature con todos los campos escapados. */}
                        <div dangerouslySetInnerHTML={{ __html: renderSignature(s, company, "").html }} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {s.googleRefreshToken && <form action={disconnectGoogle.bind(null, s.id)}><button className="btn-ghost">Desconectar Google</button></form>}
                      {s.appPassword && <form action={disconnectSender.bind(null, s.id)}><button className="btn-ghost">Borrar contraseña</button></form>}
                      {s.signatureImageType && <form action={removeSignatureImage.bind(null, s.id)}><button className="btn-ghost">Quitar imagen</button></form>}
                      {s._count.sequences === 0 && <form action={deleteSender.bind(null, s.id)}><button className="btn-danger">Eliminar remitente</button></form>}
                    </div>
                  </div>
                </div>
              )}
            </section>
          );
        })}

        <details className="appear group min-w-0 rounded-[22px] border-2 border-dashed border-white/20 bg-white/[.04] backdrop-blur transition hover:bg-white/[.07] open:border-solid open:border-[rgba(160,195,255,.14)] open:bg-[#11284c]/80 open:md:col-span-2 open:xl:col-span-3" open={editar === "nuevo"}>
          <summary className="flex min-h-[260px] cursor-pointer flex-col items-center justify-center gap-3 p-6 text-center group-open:min-h-0 group-open:flex-row group-open:justify-start">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white/10 text-2xl font-light text-white transition group-hover:bg-brand group-open:bg-brand">+</span>
            <span>
              <span className="block font-semibold text-white">Nuevo remitente</span>
              <span className="block text-[13px] opacity-70">Con Google es un clic; también vale una contraseña de aplicación.</span>
            </span>
          </summary>
          <div className="reveal border-t border-line/60 p-5">
            {google && <div className="mb-5"><GoogleButton>Agregar con Google</GoogleButton></div>}
            <form action={createSender}>
              <Fields s={{}} prefix="new" />
              <div className="mt-4"><button className="btn">Añadir remitente</button></div>
            </form>
          </div>
        </details>
      </div>
    </>
  );
}
