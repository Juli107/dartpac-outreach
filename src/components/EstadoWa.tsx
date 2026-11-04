import { estadoWa, WA_ESTADOS } from "@/lib/whatsapp";
import { marcarWa } from "@/app/(app)/verificador/actions";
import { Pill } from "@/components/ui";

/** El teléfono con el verificador de WhatsApp: si tiene, si parece fijo o si lo marcaron, y un botón para corregirlo. */
export function EstadoWa({ c }: { c: { id: string; whatsapp: string | null; phone: string | null; waMarca: string | null } }) {
  const w = estadoWa(c);
  const tel = c.whatsapp || c.phone;
  if (!tel) return <span className="text-faint">–</span>;
  const [label, tone] = WA_ESTADOS[w.estado];
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-muted">{tel}</span>
      <span className="flex items-center gap-1.5">
        <Pill tone={tone} title={w.motivo}>{label}</Pill>
        {w.estado === "si" ? (
          <form action={marcarWa.bind(null, c.id, "no")}><button className="text-[11.5px] font-medium text-faint hover:text-white" title="Si le escribiste y no tiene WhatsApp, marcalo: no se le vuelve a ofrecer">No tiene</button></form>
        ) : (
          <form action={marcarWa.bind(null, c.id, "si")}><button className="text-[11.5px] font-medium text-brand-2 hover:text-white" title="Si sabés que este número tiene WhatsApp, marcalo">Sí tiene</button></form>
        )}
      </span>
    </div>
  );
}
