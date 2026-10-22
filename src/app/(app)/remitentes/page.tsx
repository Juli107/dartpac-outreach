import { db } from "@/lib/db";
import { sentToday } from "@/lib/quota";
import { PageHeader, Pill } from "@/components/ui";
import { createSender, updateSender, disconnectSender, deleteSender, testSender } from "./actions";

export const metadata = { title: "Remitentes" };

type SenderFields = { name?: string; email?: string; signature?: string; dailyLimit?: number; hasPassword?: boolean };

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
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-pass`} className="label">Contraseña de aplicación de Google</label>
        <input
          id={`${prefix}-pass`}
          name="appPassword"
          type="password"
          autoComplete="new-password"
          placeholder={s.hasPassword ? "Guardada · escribe una nueva solo para cambiarla" : "16 letras, de myaccount.google.com/apppasswords"}
          className="input"
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-sig`} className="label">Firma</label>
        <textarea id={`${prefix}-sig`} name="signature" rows={4} defaultValue={s.signature} placeholder={"Un saludo,\nNombre Apellido\nPlupack Embalajes · Tel. 600 000 000"} className="input font-mono text-[13px]" />
      </div>
    </div>
  );
}

export default async function Senders({ searchParams }: { searchParams: Promise<{ prueba?: string; resultado?: string }> }) {
  const { prueba, resultado } = await searchParams;
  const senders = await db.sender.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { sequences: true } } } });
  const { byMailbox } = await sentToday();
  return (
    <>
      <PageHeader
        title="Remitentes"
        sub="Cada comercial envía desde su propio Gmail y con su firma. La contraseña se guarda cifrada y no se vuelve a mostrar."
      />
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
                {s.appPassword ? <Pill tone="ok">Conectado</Pill> : <Pill tone="warn">Sin conectar</Pill>}
              </div>
            </div>
            {prueba === s.id && resultado && (
              <div className={`mx-4 mt-4 rounded-lg px-3 py-2 text-sm ${resultado === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                {resultado === "ok" ? "Conexión correcta: Gmail aceptó el usuario y la contraseña." : `No se pudo conectar: ${resultado}`}
              </div>
            )}
            <form action={updateSender.bind(null, s.id)} className="p-4">
              <Fields s={{ ...s, hasPassword: !!s.appPassword }} prefix={s.id} />
              <div className="mt-3"><button className="btn">Guardar</button></div>
            </form>
            <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
              {s.appPassword && <form action={testSender.bind(null, s.id)}><button className="btn-ghost">Probar conexión</button></form>}
              {s.appPassword && <form action={disconnectSender.bind(null, s.id)}><button className="btn-ghost">Borrar contraseña</button></form>}
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
