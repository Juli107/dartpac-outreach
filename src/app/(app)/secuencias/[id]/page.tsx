import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { sequenceHealthMap, sequenceVerdict } from "@/lib/health";
import { CONFIRM_ON, nombreDeCopia, scheduleLabel } from "@/lib/labels";
import { PageHeader, Segmented, CheckList, Dot } from "@/components/ui";
import { Switch } from "@/components/Switch";
import { DuplicarSecuencia } from "@/components/DuplicarSecuencia";
import { AvisoDeUnaVez } from "@/components/AvisoDeUnaVez";
import { duplicateSequence, toggleSequence } from "../actions";
import { StepsTab } from "./_tabs/StepsTab";
import { PeopleTab } from "./_tabs/PeopleTab";
import { PreviewTab } from "./_tabs/PreviewTab";
import { StatsTab } from "./_tabs/StatsTab";
import { SettingsTab } from "./_tabs/SettingsTab";
import { LogTab } from "./_tabs/LogTab";
import { InboxTab } from "./_tabs/InboxTab";
import { base, type TabParams } from "./_tabs/types";

const TABS = [
  ["bandeja", "Bandeja"],
  ["pasos", "Pasos"],
  ["personas", "Personas"],
  ["vista", "Vista previa"],
  ["estadisticas", "Estadísticas"],
  ["ajustes", "Ajustes"],
  ["registro", "Registro"],
] as const;

// la carga masiva del Radar suma de a tandas, y cada tanda verifica los emails
export const maxDuration = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seq = await db.sequence.findUnique({ where: { id }, select: { name: true } });
  return { title: seq?.name ?? "Secuencia" };
}

export default async function SequenceDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<TabParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const seq = await db.sequence.findUnique({
    where: { id },
    include: { sender: true, steps: { orderBy: { order: "asc" }, include: { variants: { orderBy: { label: "asc" } } } } },
  });
  if (!seq) notFound();
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "pasos";

  const [health, people, unread, nombres] = await Promise.all([
    sequenceHealthMap([seq]),
    db.enrollment.count({ where: { sequenceId: id } }),
    db.reply.count({ where: { read: false, contact: { enrollments: { some: { sequenceId: id } } } } }),
    db.sequence.findMany({ select: { name: true } }),
  ]);
  const checks = health.get(id) ?? [];
  const verdict = sequenceVerdict(checks);
  const problems = checks.filter((c) => c.level === "bad" || c.level === "warn" || c.level === "info");

  return (
    <>
      <PageHeader
        back={{ href: "/secuencias", label: "Secuencias" }}
        title={
          <span className="flex items-center gap-3">
            <Switch on={seq.sendingOn} action={toggleSequence.bind(null, seq.id, !seq.sendingOn)} label={seq.sendingOn ? "Apagar secuencia" : "Encender secuencia"} confirmOn={CONFIRM_ON} disabled={seq.steps.length === 0 || seq.status === "ARCHIVED"} />
            <span className="min-w-0">{seq.name}</span>
          </span>
        }
        sub={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
            <Dot level={verdict.level} pulse={seq.sendingOn} />
            <span className="font-medium text-white">{verdict.text}</span>
            <span>· {seq.sender?.name ?? "Sin remitente"}</span>
            <span>· {scheduleLabel(seq)}</span>
            <span>· máx. {seq.dailyLimit} al día</span>
          </span>
        }
      >
        <DuplicarSecuencia action={duplicateSequence.bind(null, seq.id)} nombre={seq.name} sugerido={nombreDeCopia(seq.name, nombres.map((n) => n.name))} pasos={seq.steps.length} />
      </PageHeader>

      {sp.copia && (
        <AvisoDeUnaVez params={["copia"]} className="card appear px-4 py-3 text-sm text-ink ring-1 ring-ok/25">
          <b className="font-semibold text-[#7BE3B4]">✓ Copia lista.</b> Tiene los mismos pasos, variantes y ajustes que la original. Está apagada y sin contactos: revisala, cambiale el nombre en Ajustes si hace falta y sumá contactos en Personas.
        </AvisoDeUnaVez>
      )}

      {problems.length > 0 && (
        <details className="card appear" open={problems.some((p) => p.level === "bad")}>
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3.5">
            <span className="flex items-center gap-2 font-medium">
              <Dot level={verdict.level === "off" ? "off" : problems.some((p) => p.level === "bad") ? "bad" : problems.some((p) => p.level === "warn") ? "warn" : "info"} />
              Estado de envío: {problems.length} {problems.length === 1 ? "aviso" : "avisos"}
            </span>
            <span className="text-[13px] text-brand-2">Ver</span>
          </summary>
          <div className="reveal border-t border-line/60 py-1"><CheckList checks={problems} /></div>
        </details>
      )}

      <Segmented
        label="Secciones de la secuencia"
        active={tab}
        items={TABS.map(([k, label]) => ({
          key: k,
          label,
          href: `${base(id)}?tab=${k}`,
          count: k === "bandeja" ? unread || undefined : k === "personas" ? people : k === "pasos" ? seq.steps.length : undefined,
        }))}
      />

      {tab === "pasos" && <StepsTab seq={seq} sp={sp} />}
      {tab === "personas" && <PeopleTab seq={seq} sp={sp} />}
      {tab === "vista" && <PreviewTab seq={seq} sp={sp} />}
      {tab === "estadisticas" && <StatsTab seq={seq} />}
      {tab === "ajustes" && <SettingsTab seq={seq} sp={sp} />}
      {tab === "registro" && <LogTab seq={seq} />}
      {tab === "bandeja" && <InboxTab seq={seq} />}
    </>
  );
}
