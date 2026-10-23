import { db } from "@/lib/db";
import { renderSignature } from "@/lib/signature";
import { renderTemplate } from "@/lib/template";
import { stepDays, stepVariants } from "@/lib/variants";
import { fullName } from "@/lib/labels";
import { Empty } from "@/components/ui";
import { base, type Seq, type TabParams } from "./types";

const SAMPLE = { id: "", email: "compras@logisur.com.ar", firstName: "Marta", lastName: "Ruiz", company: "Logisur", title: "Jefa de compras", city: "Haedo", province: "Buenos Aires", website: null, phone: null };

export async function PreviewTab({ seq, sp }: { seq: Seq; sp: TabParams }) {
  const people = await db.enrollment.findMany({
    where: { sequenceId: seq.id },
    include: { contact: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const contact = people.find((p) => p.contactId === sp.contacto)?.contact ?? people[0]?.contact ?? SAMPLE;
  const company = process.env.COMPANY_NAME ?? "Plupack Embalajes";
  const from = seq.sender ? `${seq.sender.name} <${seq.sender.email}>` : "(sin remitente: elígelo en Ajustes)";
  const signature = seq.sender ? renderSignature(seq.sender, company, "", renderTemplate(seq.sender.signature, contact, { sender: seq.sender })) : null;
  const days = stepDays(seq.steps);
  // Igual que el motor: un seguimiento en el mismo hilo reutiliza el asunto del email anterior con "Re:".
  const threaded = new Map<string, string>();
  let previous = "";
  for (const step of seq.steps.filter((s) => s.type === "EMAIL")) {
    if (step.sameThread && previous) threaded.set(step.id, `Re: ${previous.replace(/^Re:\s*/i, "")}`);
    else previous = renderTemplate(step.subject, contact, { sender: seq.sender, timeZone: seq.timeZone });
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={base(seq.id)} className="card appear flex flex-wrap items-end gap-3 px-5 py-4">
        <input type="hidden" name="tab" value="vista" />
        <div className="min-w-[240px] flex-1">
          <label htmlFor="contacto" className="label">Ver como</label>
          <select id="contacto" name="contacto" defaultValue={contact.id} className="input">
            {people.length === 0 && <option value="">{fullName(SAMPLE)} (ejemplo)</option>}
            {people.map((p) => <option key={p.contactId} value={p.contactId}>{fullName(p.contact)} · {p.contact.company ?? p.contact.email}</option>)}
          </select>
        </div>
        <button className="btn-ghost">Ver</button>
      </form>

      {seq.steps.length === 0 && <div className="card"><Empty title="Sin pasos que mostrar" /></div>}

      {seq.steps.map((step, i) => {
        const ctx = { sender: seq.sender, timeZone: seq.timeZone };
        if (step.type === "WHATSAPP") {
          return (
            <article key={step.id} className="card appear px-5 py-4">
              <div className="text-xs font-medium text-muted">Paso {step.order} · Día {days[i]} · WhatsApp (queda en Tareas con este mensaje)</div>
              <div className="mt-3 max-w-md rounded-2xl rounded-tl-md bg-[#0F3B2A]/80 px-4 py-3 text-[14px] leading-relaxed text-[#E6FFF2] ring-1 ring-wa/25">
                <p className="whitespace-pre-wrap">{renderTemplate(step.body, contact, ctx) || "(sin mensaje)"}</p>
              </div>
            </article>
          );
        }
        if (step.type !== "EMAIL") {
          return (
            <article key={step.id} className="card appear px-5 py-4">
              <div className="text-xs font-medium text-muted">Paso {step.order} · Día {days[i]} · Llamada o tarea</div>
              <div className="mt-1 font-semibold text-white">{renderTemplate(step.subject || "Tarea manual", contact, ctx)}</div>
              {step.body && <p className="mt-1 whitespace-pre-wrap text-muted">{renderTemplate(step.body, contact, ctx)}</p>}
            </article>
          );
        }
        return stepVariants(step).map((v) => {
          const subject = threaded.get(step.id) ?? renderTemplate(v.subject, contact, ctx);
          return (
            <article key={`${step.id}-${v.label}`} className="appear overflow-hidden rounded-[22px] ring-1 ring-white/10">
              <div className="flex items-center justify-between gap-2 bg-white/[.06] px-5 py-2.5 text-xs text-muted">
                <span>Paso {step.order} · Día {days[i]}{stepVariants(step).length > 1 ? ` · Variante ${v.label}` : ""}</span>
                {seq.plainText && <span className="chip">Solo texto</span>}
              </div>
              <div className="paper rounded-none px-5 py-4 leading-relaxed shadow-none">
                <div className="text-[13px] text-[#5b6b82]">De: {from}</div>
                <div className="text-[13px] text-[#5b6b82]">Para: {contact.email ?? "(sin email: este paso se saltea y sigue el próximo)"}</div>
                <div className="mb-3 mt-2 text-[17px] font-semibold">{subject || "(sin asunto)"}</div>
                <div className="whitespace-pre-wrap">{renderTemplate(v.body, contact, ctx)}</div>
                {signature && (seq.plainText ? (
                  <pre className="mt-4 whitespace-pre-wrap font-sans text-[#5b6b82]">--{"\n"}{signature.text}</pre>
                ) : (
                  // HTML generado por renderSignature con todos los campos escapados.
                  <div dangerouslySetInnerHTML={{ __html: signature.html }} />
                ))}
              </div>
            </article>
          );
        });
      })}
    </div>
  );
}
