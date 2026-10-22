import { db } from "@/lib/db";
import { sentToday } from "@/lib/quota";
import { renderSignature, type SignatureSender } from "@/lib/signature";
import { PageHeader, Pill } from "@/components/ui";
import { googleConfigured } from "@/lib/google";
import { createSender, updateSender, disconnectSender, disconnectGoogle, deleteSender, testSender, removeSignatureImage } from "./actions";

export const metadata = { title: "Remitentes" };

type SenderFields = Partial<SignatureSender> & { dailyLimit?: number; hasPassword?: boolean; hasImage?: boolean; viaGoogle?: boolean };

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
    <a href={href} className="btn-ghost inline-flex items-center gap-2">
      <GoogleIcon />
      {children}
    </a>
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

      <h3 className="mt-2 font-semibold sm:col-span-2">Firma</h3>
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
      <div>
        <label htmlFor={`${prefix}-img`} className="label">Imagen {s.hasImage ? "(guardada · sube otra para cambiarla)" : "(opcional)"}</label>
        <input id={`${prefix}-img`} name="signatureImage" type="file" accept="image/png,image/jpeg,image/gif" className="input py-1.5" />
        <p className="mt-1 text-xs text-muted">PNG o JPG, máx. 300 KB. Logo o foto cuadrada (128×128 px) o una firma diseñada de hasta 960 px de ancho.</p>
      </div>
      <div>
        <label htmlFor={`${prefix}-mode`} className="label">Cómo usar la imagen</label>
        <select id={`${prefix}-mode`} name="signatureImageMode" defaultValue={s.signatureImageMode ?? "LOGO"} className="input">
          <option value="LOGO">Logo o foto junto a los datos</option>
          <option value="FULL">La imagen es la firma completa</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-sig`} className="label">Texto extra (opcional)</label>
        <textarea id={`${prefix}-sig`} name="signature" rows={2} defaultValue={s.signature} placeholder="Dirección, horario o una línea legal" className="input font-mono text-[13px]" />
      </div>
    </div>
  );
}

export default async function Senders({
  searchParams,
}: {
  searchParams: Promise<{ prueba?: string; resultado?: string; error?: string; conectado?: string }>;
}) {
  const { prueba, resultado, error, conectado } = await searchParams;
  const google = googleConfigured();
  const senders = await db.sender.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { sequences: true } } } });
  const { byMailbox } = await sentToday();
  const company = process.env.COMPANY_NAME ?? "Plupack Embalajes";
  return (
    <>
      <PageHeader
        title="Remitentes"
        sub="Cada comercial envía desde su propio Gmail y con su firma. La conexión se guarda cifrada y no se vuelve a mostrar."
      >
        {google && <GoogleButton>Agregar perfil con Google</GoogleButton>}
      </PageHeader>
      {error === "google-sin-configurar" ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Falta configurar Google: añade GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Vercel.
        </div>
      ) : (
        error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}
      {conectado && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {conectado} quedó conectado con Google. Los envíos siguen apagados hasta que los enciendas en el Panel.
        </div>
      )}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {senders.map((s) => (
          <section key={s.id} className="card min-w-0">
            <div className="card-title flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="inline">{s.name}</h2>
                <span className="ml-2 text-muted">{s.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">{s._count.sequences} secuencias</span>
                <Pill tone={(byMailbox.get(s.email) ?? 0) >= s.dailyLimit ? "warn" : "neutral"}>Hoy {byMailbox.get(s.email) ?? 0} / {s.dailyLimit}</Pill>
                {s.googleRefreshToken ? (
                  <Pill tone="ok">Conectado con Google</Pill>
                ) : s.appPassword ? (
                  <Pill tone="ok">Conectado</Pill>
                ) : (
                  <Pill tone="warn">Sin conectar</Pill>
                )}
              </div>
            </div>
            {prueba === s.id && resultado && (
              <div className={`mx-4 mt-4 rounded-lg px-3 py-2 text-sm ${resultado === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                {resultado === "ok" ? "Conexión correcta: Gmail aceptó las credenciales (no se envió nada)." : `No se pudo conectar: ${resultado}`}
              </div>
            )}
            <div className="mx-4 mt-4 rounded-lg border border-line bg-white px-4 pb-4">
              <p className="pt-3 text-xs text-muted">Así se verá la firma</p>
              {/* HTML generado por renderSignature con todos los campos escapados. */}
              <div dangerouslySetInnerHTML={{ __html: renderSignature(s, company, "").html }} />
            </div>
            <form action={updateSender.bind(null, s.id)} className="p-4">
              <Fields s={{ ...s, hasPassword: !!s.appPassword, hasImage: !!s.signatureImageType, viaGoogle: !!s.googleRefreshToken }} prefix={s.id} />
              <div className="mt-3"><button className="btn">Guardar</button></div>
            </form>
            <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
              {google && !s.googleRefreshToken && <GoogleButton senderId={s.id}>Conectar con Google</GoogleButton>}
              {(s.appPassword || s.googleRefreshToken) && <form action={testSender.bind(null, s.id)}><button className="btn-ghost">Probar conexión</button></form>}
              {s.googleRefreshToken && <form action={disconnectGoogle.bind(null, s.id)}><button className="btn-ghost">Desconectar Google</button></form>}
              {s.appPassword && <form action={disconnectSender.bind(null, s.id)}><button className="btn-ghost">Borrar contraseña</button></form>}
              {s.signatureImageType && <form action={removeSignatureImage.bind(null, s.id)}><button className="btn-ghost">Quitar imagen</button></form>}
              {s._count.sequences === 0 && <form action={deleteSender.bind(null, s.id)}><button className="btn-danger">Eliminar remitente</button></form>}
            </div>
          </section>
        ))}
        <section className="card min-w-0">
          <h2 className="card-title">Añadir remitente</h2>
          <form action={createSender} className="p-4">
            <Fields s={{}} prefix="new" />
            <div className="mt-3"><button className="btn">Añadir</button></div>
          </form>
        </section>
      </div>
    </>
  );
}
