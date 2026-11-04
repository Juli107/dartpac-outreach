import { db } from "@/lib/db";
import { fullName, type Tone } from "@/lib/labels";
import { estadoWa, type WaEstado } from "@/lib/whatsapp";
import { sincronizarEtapas } from "@/lib/etapas";
import { PageHeader, Segmented, Pill, Empty, Kpi, Flash } from "@/components/ui";
import { EstadoWa } from "@/components/EstadoWa";
import { corregirEmail, verificarContactos } from "../contactos/actions";
import { quitarEmailContacto } from "./actions";
import { ListChecker } from "./ListChecker";

export const metadata = { title: "Verificar contactos" };

const TABS = [
  ["contactos", "Mis contactos"],
  ["lista", "Pegar una lista"],
] as const;

const VER = [
  ["todo", "Todo para revisar"],
  ["correos", "Correos"],
  ["whatsapp", "WhatsApp"],
] as const;

const EST: Record<string, [string, Tone]> = { valido: ["Válido", "ok"], riesgoso: ["Riesgoso", "warn"], corregible: ["Con tipeo", "warn"], invalido: ["Inválido", "bad"] };
const MAIL_MAL = ["invalido", "corregible", "riesgoso"];
const WA_MAL: WaEstado[] = ["fijo", "no"];

/**
 * Un solo verificador para cada contacto: el correo (formato, tipeos, dominio que recibe mail) y el WhatsApp (si el
 * número es celular, si parece fijo o si alguien marcó que no tiene). No se manda nada para comprobarlo.
 */
export default async function Verificador({ searchParams }: { searchParams: Promise<{ tab?: string; ver?: string; verificados?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "contactos";
  const ver = VER.some(([k]) => k === sp.ver) ? sp.ver! : "todo";
  return (
    <>
      <PageHeader
        title="Verificar contactos"
        sub="Revisa el correo y el WhatsApp de cada contacto antes de escribirle. Un correo con problemas no recibe mails, y a quien no tiene WhatsApp no se le ofrece mandarle uno. No se le escribe a nadie para comprobarlo."
      />
      <Segmented label="Qué verificar" active={tab} items={TABS.map(([k, label]) => ({ key: k, label, href: `/verificador?tab=${k}` }))} />
      {sp.verificados && <Flash tone="ok">Listo: se verificaron {sp.verificados} correos.</Flash>}
      {tab === "lista" ? <ListChecker /> : <Contactos ver={ver} />}
    </>
  );
}

async function Contactos({ ver }: { ver: string }) {
  await sincronizarEtapas();
  const [porEstado, sinVerificar, telefonos] = await Promise.all([
    db.contact.groupBy({ by: ["emailStatus"], where: { email: { not: null } }, _count: true }),
    db.contact.count({ where: { email: { not: null }, emailCheckedAt: null } }),
    db.contact.findMany({ select: { id: true, whatsapp: true, phone: true, waMarca: true, emailStatus: true } }),
  ]);
  const n = (k: string | null) => porEstado.find((r) => r.emailStatus === k)?._count ?? 0;
  const wa = new Map(telefonos.map((c) => [c.id, estadoWa(c).estado]));
  const w = (k: WaEstado) => [...wa.values()].filter((e) => e === k).length;

  // los que tienen algo para revisar, según el filtro
  const ids = telefonos
    .filter((c) => {
      const mail = MAIL_MAL.includes(c.emailStatus ?? "");
      const tel = WA_MAL.includes(wa.get(c.id)!);
      return ver === "correos" ? mail : ver === "whatsapp" ? tel : mail || tel;
    })
    .map((c) => c.id);
  const revisar = ids.length
    ? await db.contact.findMany({ where: { id: { in: ids.slice(0, 2000) } }, orderBy: [{ emailStatus: "asc" }, { createdAt: "desc" }], take: 300 })
    : [];
  const volver = `/verificador?tab=contactos${ver !== "todo" ? `&ver=${ver}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.12em] text-faint">Correos</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="Válidos" value={n("valido").toLocaleString("es-AR")} />
          <Kpi label="Con tipeo" value={n("corregible").toLocaleString("es-AR")} />
          <Kpi label="Riesgosos" value={n("riesgoso").toLocaleString("es-AR")} />
          <Kpi label="Inválidos" value={n("invalido").toLocaleString("es-AR")} />
          <Kpi label="Sin verificar" value={sinVerificar.toLocaleString("es-AR")} />
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.12em] text-faint">WhatsApp</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Tienen WhatsApp" value={w("si").toLocaleString("es-AR")} />
          <Kpi label="Parecen fijos" value={w("fijo").toLocaleString("es-AR")} />
          <Kpi label="Sin WhatsApp" value={w("no").toLocaleString("es-AR")} />
          <Kpi label="Sin número" value={w("sin").toLocaleString("es-AR")} />
        </div>
      </div>

      <section className="card appear min-w-0 overflow-hidden">
        <div className="card-title flex-wrap">
          <h2>Para revisar</h2>
          <div className="flex flex-wrap gap-2">
            {sinVerificar > 0 && <form action={verificarContactos}><input type="hidden" name="volver" value={volver} /><button className="btn">Verificar los {sinVerificar.toLocaleString("es-AR")} correos sin revisar</button></form>}
            <form action={verificarContactos}><input type="hidden" name="todos" value="1" /><input type="hidden" name="volver" value={volver} /><button className="btn-ghost text-[13px]" title="Vuelve a revisar todos los correos (formato y DNS)">Volver a verificar todos</button></form>
          </div>
        </div>
        <div className="px-5 pb-2">
          <Segmented label="Qué revisar" active={ver} items={VER.map(([k, label]) => ({ key: k, label, href: `/verificador?tab=contactos${k !== "todo" ? `&ver=${k}` : ""}` }))} />
        </div>
        {revisar.length === 0 ? (
          <Empty title="No hay nada para revisar">Los correos con problemas no reciben mails de las secuencias, y a quien no tiene WhatsApp no se le ofrece mandarle uno.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Contacto</th><th>Correo</th><th>WhatsApp</th></tr></thead>
              <tbody>
                {revisar.map((c) => (
                  <tr key={c.id}>
                    <td className="max-w-[220px]">
                      <span className="block truncate font-medium text-white">{fullName(c)}</span>
                      {c.city && <span className="block truncate text-xs text-faint">{c.city}</span>}
                    </td>
                    <td className="max-w-[340px]">
                      {c.email ? (
                        <div className="flex flex-col items-start gap-1">
                          <span className="block max-w-full truncate text-ink/90" title={c.email}>{c.email}</span>
                          <span className="flex flex-wrap items-center gap-1.5">
                            {c.emailStatus && EST[c.emailStatus] ? <Pill tone={EST[c.emailStatus][1]} title={c.emailReason ?? undefined}>{EST[c.emailStatus][0]}</Pill> : <span className="text-[11px] text-faint">Sin verificar</span>}
                            {c.emailStatus === "corregible" && c.emailSuggestion && <form action={corregirEmail.bind(null, c.id)}><button className="text-[11.5px] font-medium text-brand-2 hover:text-white">Corregir a {c.emailSuggestion}</button></form>}
                            {c.emailStatus === "invalido" && <form action={quitarEmailContacto.bind(null, c.id)}><button className="text-[11.5px] font-medium text-[#FF9A9A] hover:text-white">Quitar el correo</button></form>}
                          </span>
                          {c.emailStatus && c.emailStatus !== "valido" && c.emailReason && <span className="whitespace-normal text-[12px] text-muted">{c.emailReason}</span>}
                        </div>
                      ) : (
                        <span className="text-faint">–</span>
                      )}
                    </td>
                    <td><EstadoWa c={c} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ids.length > 300 && <p className="px-5 py-3 text-xs text-faint">Se muestran 300 de {ids.length.toLocaleString("es-AR")}. A medida que los corrijas aparecen los demás.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
