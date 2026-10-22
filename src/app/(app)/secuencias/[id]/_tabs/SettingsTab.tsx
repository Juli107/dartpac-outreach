import Link from "next/link";
import { db } from "@/lib/db";
import { DAYS, TIME_ZONES } from "@/lib/labels";
import { Flash } from "@/components/ui";
import { setSequenceStatus, updateSequence } from "../../actions";
import type { Seq, TabParams } from "./types";

const HOURS = Array.from({ length: 25 }, (_, h) => h);

export async function SettingsTab({ seq, sp }: { seq: Seq; sp: TabParams }) {
  const senders = await db.sender.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
      <form action={updateSequence.bind(null, seq.id)} className="card appear grid gap-5 p-5">
        {sp.guardado && <Flash tone="ok">Ajustes guardados.</Flash>}
        {sp.error && <Flash tone="bad">{sp.error}</Flash>}
        <div>
          <label htmlFor="seq-name" className="label">Nombre</label>
          <input id="seq-name" name="name" defaultValue={seq.name} className="input" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="seq-sender" className="label">Envía</label>
            <select id="seq-sender" name="senderId" required defaultValue={seq.senderId ?? ""} className="input">
              <option value="" disabled>Elige quién envía</option>
              {senders.map((s) => (
                <option key={s.id} value={s.id}>{s.name} · {s.email}{s.appPassword || s.googleRefreshToken ? "" : " (sin conectar)"}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">Los emails salen de este buzón con su firma. Se gestionan en <Link href="/remitentes" className="text-brand">Remitentes</Link>.</p>
          </div>
          <div>
            <label htmlFor="seq-limit" className="label">Máximo de emails al día</label>
            <input id="seq-limit" name="dailyLimit" type="number" min={1} max={500} defaultValue={seq.dailyLimit} className="input" />
          </div>
        </div>

        <fieldset className="grid gap-4 rounded-2xl bg-black/[.025] p-4">
          <legend className="sr-only">Horario de envío</legend>
          <h2>Horario de envío</h2>
          <div>
            <label htmlFor="seq-tz" className="label">Zona horaria</label>
            <select id="seq-tz" name="timeZone" defaultValue={seq.timeZone} className="input">
              {TIME_ZONES.map(([z, label]) => <option key={z} value={z}>{label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="seq-start" className="label">Desde</label>
              <select id="seq-start" name="startHour" defaultValue={seq.startHour} className="input">
                {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="seq-end" className="label">Hasta</label>
              <select id="seq-end" name="endHour" defaultValue={seq.endHour} className="input">
                {HOURS.slice(1).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
              </select>
            </div>
          </div>
          <div>
            <span className="label">Días</span>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(([n, label]) => (
                <label key={n} className="cursor-pointer">
                  <input type="checkbox" name="sendDays" value={n} defaultChecked={seq.sendDays.includes(n)} className="peer sr-only" />
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-black/[.05] font-semibold text-muted transition peer-checked:bg-navy peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-brand/20">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted">El programador automático pasa de lunes a viernes, de 8 a 19 h de Argentina. Un horario fuera de esa franja no envía.</p>
        </fieldset>
        <div><button className="btn">Guardar ajustes</button></div>
      </form>

      <section className="card appear p-5">
        <h2>Archivar</h2>
        <p className="mt-1 text-[13px] text-muted">La secuencia se apaga y desaparece de la lista. Su historial se conserva.</p>
        {seq.status === "ARCHIVED" ? (
          <form action={setSequenceStatus.bind(null, seq.id, "PAUSED")} className="mt-3"><button className="btn-ghost">Recuperar</button></form>
        ) : (
          <form action={setSequenceStatus.bind(null, seq.id, "ARCHIVED")} className="mt-3"><button className="btn-danger bg-[#FF3B30]/[.06]">Archivar secuencia</button></form>
        )}
      </section>
    </div>
  );
}
