import { db } from "@/lib/db";
import { renderSignature } from "@/lib/signature";
import { renderTemplate } from "@/lib/template";
import { stepDays, stepVariants } from "@/lib/variants";
import { fullName } from "@/lib/labels";
import { Empty } from "@/components/ui";
import { base, type Seq, type TabParams } from "./types";

const SAMPLE = { id: "", email: "marta@logisur.com.ar", firstName: "Marta", lastName: "Ruiz", company: "Logisur", title: "Jefa de compras" };

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
  const signature = seq.sender ? renderSignature(seq.sender, company, "", renderTemplate(seq.sender.signature, contact)) : null;
  const days = stepDays(seq.steps);
  // Igual que el motor: un seguimiento en el mismo hilo reutiliza el asunto del email anterior con "Re:".
  const threaded = new Map<string, string>();
  let previous = "";
  for (const step of seq.steps.filter((s) => s.type === "EMAIL")) {
    if (step.sameThread && previous) threaded.set(step.id, `Re: ${previous.replace(/^Re:\s*/i, "")}`);
    else previous = renderTemplate(step.subject, contact);
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
        if (step.type !== "EMAIL") {
          return (
            <article key={step.id} className="card appear px-5 py-4">
              <div className="text-xs font-medium text-muted">Paso {step.order} · Día {days[i]} · Tarea manual</div>
              <div className="mt-1 font-semibold">{renderTemplate(step.subject || "Tarea manual", contact)}</div>
              {step.body && <p className="mt-1 whitespace-pre-wrap text-muted">{renderTemplate(step.body, contact)}</p>}
            </article>
          );
        }
        return stepVariants(step).map((v) => {
          const subject = threaded.get(step.id) ?? renderTemplate(v.subject, contact);
          return (
            <article key={`${step.id}-${v.label}`} className="card appear overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-line/70 bg-black/[.015] px-5 py-2.5 text-xs text-muted">
                <span>Paso {step.order} · Día {days[i]}{stepVariants(step).length > 1 ? ` · Variante ${v.label}` : ""}</span>
                {seq.plainText && <span className="chip">Solo texto</span>}
              </div>
              <div className="px-5 py-4 leading-relaxed">
                <div className="text-[13px] text-muted">De: {from}</div>
                <div className="text-[13px] text-muted">Para: {contact.email}</div>
                <div className="mb-3 mt-2 text-[17px] font-semibold">{subject || "(sin asunto)"}</div>
                <div className="whitespace-pre-wrap">{renderTemplate(v.body, contact)}</div>
                {signature && (seq.plainText ? (
                  <pre className="mt-4 whitespace-pre-wrap font-sans text-muted">--{"\n"}{signature.text}</pre>
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
