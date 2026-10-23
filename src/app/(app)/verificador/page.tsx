import Link from "next/link";
import { db } from "@/lib/db";
import { fullName, type Tone } from "@/lib/labels";
import { duplicados, verificarLocal } from "@/lib/verifier";
import { listCol } from "@/lib/radar/store";
import { provNom } from "@/lib/radar/geo";
import { PageHeader, Segmented, Pill, Empty, Kpi, Flash } from "@/components/ui";
import { corregirEmail, verificarContactos } from "../contactos/actions";
import { corregirRadar, quitarEmailContacto, quitarEmailRadar } from "./actions";
import { ListChecker } from "./ListChecker";

export const metadata = { title: "Verificar correos" };

const TABS = [
  ["lista", "Pegar una lista"],
  ["contactos", "Contactos de Outreach"],
  ["radar", "Empresas del Radar"],
] as const;

const EST: Record<string, [string, Tone]> = { valido: ["Válido", "ok"], riesgoso: ["Riesgoso", "warn"], corregible: ["Con tipeo", "warn"], invalido: ["Inválido", "bad"] };

export default async function Verificador({ searchParams }: { searchParams: Promise<{ tab?: string; verificados?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "lista";
  return (
    <>
      <PageHeader title="Verificar correos" sub="Antes de cargar y de enviar: formato, errores de tipeo, direcciones de prueba o temporales, casillas genéricas y si el dominio de verdad recibe correo. No se manda ningún email para comprobarlo." />
      <Segmented label="Qué verificar" active={tab} items={TABS.map(([k, label]) => ({ key: k, label, href: `/verificador?tab=${k}` }))} />
      {sp.verificados && <Flash tone="ok">Listo: se verificaron {sp.verificados} contactos.</Flash>}
      {tab === "lista" && <ListChecker />}
      {tab === "contactos" && <Contactos />}
      {tab === "radar" && <Radar />}
    </>
  );
}

async function Contactos() {
  const [porEstado, problemas, sinVerificar] = await Promise.all([
    db.contact.groupBy({ by: ["emailStatus"], where: { email: { not: null } }, _count: true }),
    db.contact.findMany({ where: { emailStatus: { in: ["invalido", "corregible", "riesgoso"] } }, orderBy: [{ emailStatus: "asc" }, { createdAt: "desc" }], take: 300 }),
    db.contact.count({ where: { email: { not: null }, emailCheckedAt: null } }),
  ]);
  const n = (k: string | null) => porEstado.find((r) => r.emailStatus === k)?._count ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Válidos" value={n("valido").toLocaleString("es-AR")} />
        <Kpi label="Con tipeo" value={n("corregible").toLocaleString("es-AR")} />
        <Kpi label="Riesgosos" value={n("riesgoso").toLocaleString("es-AR")} />
        <Kpi label="Inválidos" value={n("invalido").toLocaleString("es-AR")} />
        <Kpi label="Sin verificar" value={sinVerificar.toLocaleString("es-AR")} />
      </div>
      <section className="card appear min-w-0 overflow-hidden">
        <div className="card-title flex-wrap">
          <h2>Correos para revisar</h2>
          <div className="flex flex-wrap gap-2">
            {sinVerificar > 0 && <form action={verificarContactos}><input type="hidden" name="volver" value="/verificador?tab=contactos" /><button className="btn">Verificar los {sinVerificar.toLocaleString("es-AR")} sin revisar</button></form>}
            <form action={verificarContactos}><input type="hidden" name="todos" value="1" /><input type="hidden" name="volver" value="/verificador?tab=contactos" /><button className="btn-ghost text-[13px]" title="Vuelve a revisar todos (formato y DNS)">Volver a verificar todos</button></form>
          </div>
        </div>
        {problemas.length === 0 ? (
          <Empty title="No hay correos con problemas">Los inválidos y los que tienen tipeos no reciben emails de las secuencias hasta que se corrijan.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Contacto</th><th>Email</th><th>Estado</th><th>Motivo</th><th></th></tr></thead>
              <tbody>
                {problemas.map((c) => (
                  <tr key={c.id}>
                    <td className="max-w-[220px] truncate font-medium text-white">{fullName(c)}</td>
                    <td className="text-ink/90">{c.email}</td>
                    <td>{c.emailStatus && EST[c.emailStatus] && <Pill tone={EST[c.emailStatus][1]}>{EST[c.emailStatus][0]}</Pill>}</td>
                    <td className="max-w-[320px] whitespace-normal text-[13px] text-muted">{c.emailReason}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {c.emailStatus === "corregible" && c.emailSuggestion && <form action={corregirEmail.bind(null, c.id)}><button className="btn-ghost text-[13px]">Corregir a {c.emailSuggestion}</button></form>}
                        {c.emailStatus === "invalido" && <form action={quitarEmailContacto.bind(null, c.id)}><button className="btn-danger text-[13px]">Quitar el email</button></form>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

async function Radar() {
  const ps = (await listCol("prospectos")).filter((p) => typeof p.data.email === "string" && p.data.email.trim() && p.data.etapa !== "descartado");
  const dup = duplicados(ps.map((p) => String(p.data.email)));
  const filas = ps.map((p) => {
    const r = verificarLocal(p.data.email);
    const rebotado = !!p.data.emailRebotado;
    return { id: p.id, p: p.data, r: rebotado ? { ...r, estado: "invalido" as const, motivos: [{ k: "rebote", t: "El mail rebotó: la dirección no existe o no recibe correos" }, ...r.motivos], sugerencia: "" } : r, dup: dup.has(r.normal) };
  });
  const cuenta = (k: string) => filas.filter((f) => f.r.estado === k).length;
  const malos = filas.filter((f) => f.r.estado !== "valido" || f.dup).sort((a, b) => ["corregible", "invalido", "riesgoso", "valido"].indexOf(a.r.estado) - ["corregible", "invalido", "riesgoso", "valido"].indexOf(b.r.estado));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Empresas con email" value={filas.length.toLocaleString("es-AR")} />
        <Kpi label="Válidos" value={cuenta("valido").toLocaleString("es-AR")} />
        <Kpi label="Con tipeo" value={cuenta("corregible").toLocaleString("es-AR")} />
        <Kpi label="Riesgosos" value={cuenta("riesgoso").toLocaleString("es-AR")} />
        <Kpi label="Inválidos" value={cuenta("invalido").toLocaleString("es-AR")} />
      </div>
      <section className="card appear min-w-0 overflow-hidden">
        <div className="card-title"><h2>Emails del Radar para revisar</h2><Link href="/radar" className="text-[13px] font-medium text-brand-2 hover:text-white">Abrir el Radar</Link></div>
        {malos.length === 0 ? (
          <Empty title="Todos los emails del Radar están bien">El Radar revisa cada email al cargarlo y antes de mandar un mail.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Empresa</th><th>Email</th><th>Estado</th><th>Motivo</th><th></th></tr></thead>
              <tbody>
                {malos.slice(0, 400).map(({ id, p, r, dup: d }) => (
                  <tr key={id}>
                    <td className="max-w-[240px]">
                      <span className="block truncate font-medium text-white">{String(p.nombre ?? "")}</span>
                      <span className="block truncate text-xs text-faint">{[p.ciudad, provNom(String(p.provincia ?? ""))].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className="text-ink/90">{String(p.email)}</td>
                    <td className="space-x-1">{EST[r.estado] && <Pill tone={EST[r.estado][1]}>{EST[r.estado][0]}</Pill>}{d && <Pill tone="neutral">Repetido</Pill>}</td>
                    <td className="max-w-[320px] whitespace-normal text-[13px] text-muted">{r.motivos[0]?.t ?? (d ? "Otra empresa tiene el mismo email" : "")}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {r.estado === "corregible" && r.sugerencia && <form action={corregirRadar.bind(null, id)}><button className="btn-ghost text-[13px]">Corregir a {r.sugerencia}</button></form>}
                        {r.estado === "invalido" && <form action={quitarEmailRadar.bind(null, id)}><button className="btn-danger text-[13px]">Quitar el email</button></form>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
