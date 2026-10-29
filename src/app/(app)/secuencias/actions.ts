"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { nextSendTime, windowFor } from "@/lib/schedule";
import { nextVariantLabel } from "@/lib/variants";
import type { Prisma } from "@prisma/client";
import { eventoRadar } from "@/lib/radar/outreach";
import { iaConfigurada, parsearJson, pedirTexto } from "@/lib/radar/claude";
import { quienSoy } from "@/lib/yo";
import { nombreDeCopia } from "@/lib/labels";
import { CLAVE_VALIDA, RESERVADAS } from "@/lib/template";
import { cargarVariables, normalizarVariables } from "@/lib/variables";

/**
 * Secuencia nueva, vacía: los pasos los elige el equipo (email, WhatsApp o tarea), sin nada de fábrica.
 * Si quien la crea entró con Google y tiene su buzón cargado, sale de entrada desde ese buzón (se cambia en Ajustes).
 */
export async function createSequence(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  const yo = await quienSoy().catch(() => null);
  const seq = await db.sequence.create({ data: { name, senderId: yo?.senderId ?? null } });
  redirect(`/secuencias/${seq.id}?tab=pasos`);
}

/**
 * Duplica una secuencia con sus pasos, variantes, horario, remitente y límite diario. La copia nace apagada y sin
 * contactos, para revisarla antes de encenderla.
 */
export async function duplicateSequence(id: string, form: FormData) {
  const src = await db.sequence.findUnique({
    where: { id },
    include: { steps: { orderBy: { order: "asc" }, include: { variants: { orderBy: { label: "asc" } } } } },
  });
  if (!src) redirect("/secuencias");
  let name = String(form.get("name") ?? "").trim().slice(0, 120);
  if (!name) {
    const usados = await db.sequence.findMany({ where: { name: { startsWith: src.name.replace(/\s+\(copia(?: \d+)?\)$/i, "") } }, select: { name: true } });
    name = nombreDeCopia(src.name, usados.map((u) => u.name));
  }
  const copia = await db.sequence.create({
    data: {
      name,
      status: "DRAFT",
      sendingOn: false,
      dailyLimit: src.dailyLimit,
      senderId: src.senderId,
      timeZone: src.timeZone,
      startHour: src.startHour,
      endHour: src.endHour,
      sendDays: src.sendDays,
      plainText: src.plainText,
      steps: {
        create: src.steps.map((st) => ({
          order: st.order,
          type: st.type,
          delayDays: st.delayDays,
          subject: st.subject,
          body: st.body,
          sameThread: st.sameThread,
          variants: { create: st.variants.map((v) => ({ label: v.label, subject: v.subject, body: v.body })) },
        })),
      },
    },
  });
  revalidatePath("/secuencias");
  revalidatePath("/");
  redirect(`/secuencias/${copia.id}?tab=pasos&copia=1`);
}

function refresh(id: string) {
  revalidatePath(`/secuencias/${id}`);
  revalidatePath("/secuencias");
  revalidatePath("/");
}

export async function setSequenceStatus(id: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED" | "DRAFT") {
  // Archivar o pausar también apaga el interruptor: nunca queda enviando algo que no se ve.
  await db.sequence.update({ where: { id }, data: { status, ...(status === "ACTIVE" ? {} : { sendingOn: false }) } });
  refresh(id);
}

/** Interruptor de la secuencia: encendida envía sola dentro de su horario; apagada no envía nada. */
export async function toggleSequence(id: string, on: boolean) {
  if (on) {
    const steps = await db.step.count({ where: { sequenceId: id } });
    if (steps === 0) return;
  }
  await db.sequence.update({ where: { id }, data: { sendingOn: on, status: on ? "ACTIVE" : "PAUSED" } });
  refresh(id);
}

const settingsSchema = z.object({
  name: z.string().trim().min(1),
  dailyLimit: z.coerce.number().int().min(1).max(500),
  senderId: z.string().transform((v) => v || null),
  timeZone: z.string().min(1),
  startHour: z.coerce.number().int().min(0).max(23),
  endHour: z.coerce.number().int().min(1).max(24),
  sendDays: z.array(z.coerce.number().int().min(0).max(6)).min(1),
});

export async function updateSequence(id: string, form: FormData) {
  const parsed = settingsSchema.safeParse({
    name: form.get("name"),
    dailyLimit: form.get("dailyLimit"),
    senderId: form.get("senderId") ?? "",
    timeZone: form.get("timeZone"),
    startHour: form.get("startHour"),
    endHour: form.get("endHour"),
    sendDays: form.getAll("sendDays"),
  });
  if (!parsed.success || parsed.data.endHour <= parsed.data.startHour) {
    redirect(`/secuencias/${id}?tab=ajustes&error=${encodeURIComponent("Revisa el horario: la hora de fin debe ser posterior a la de inicio y hace falta al menos un día.")}`);
  }
  await db.sequence.update({ where: { id }, data: parsed.data });
  refresh(id);
  redirect(`/secuencias/${id}?tab=ajustes&guardado=1`);
}

export async function setPlainText(id: string, on: boolean) {
  await db.sequence.update({ where: { id }, data: { plainText: on } });
  refresh(id);
}

const STEP_TYPES = ["EMAIL", "TASK", "WHATSAPP"] as const;

const stepSchema = z.object({
  type: z.enum(STEP_TYPES),
  delayDays: z.coerce.number().int().min(0).max(90),
  subject: z.string().default(""),
  body: z.string().default(""),
  sameThread: z.preprocess((v) => v === "on", z.boolean()),
});

function readStep(form: FormData) {
  return stepSchema.parse({
    type: form.get("type"),
    delayDays: form.get("delayDays"),
    subject: form.get("subject") ?? "",
    body: form.get("body") ?? "",
    sameThread: form.get("sameThread"),
  });
}

export async function addStep(sequenceId: string, form: FormData) {
  const last = await db.step.findFirst({ where: { sequenceId }, orderBy: { order: "desc" } });
  const step = await db.step.create({ data: { sequenceId, order: (last?.order ?? 0) + 1, ...readStep(form) } });
  refresh(sequenceId);
  redirect(`/secuencias/${sequenceId}?tab=pasos&nuevo=${step.id}#paso-${step.id}`);
}

/** Sube o baja un paso (intercambia el orden con el vecino). */
export async function moveStep(stepId: string, dir: -1 | 1) {
  const step = await db.step.findUniqueOrThrow({ where: { id: stepId } });
  const other = await db.step.findFirst({ where: { sequenceId: step.sequenceId, order: step.order + dir } });
  if (!other) return;
  // el orden es único por secuencia: se pasa por un valor temporal. Las esperas quedan en su lugar:
  // se mueve el contenido del paso, no el calendario.
  await db.$transaction([
    db.step.update({ where: { id: step.id }, data: { order: -1 } }),
    db.step.update({ where: { id: other.id }, data: { order: step.order, delayDays: step.delayDays } }),
    db.step.update({ where: { id: step.id }, data: { order: other.order, delayDays: other.delayDays } }),
  ]);
  refresh(step.sequenceId);
}

/** Borra los datos de ejemplo que creaba la primera versión (solo si siguen ahí). */
export async function borrarEjemplos() {
  const nombres = ["Distribuidores de embalaje · Q4", "Ecommerce · cajas personalizadas"];
  const emails = ["marta@logisur.es", "jorge@tiendasnordica.es", "lucia@frutaslevante.es", "andres@mueblespena.es", "sara@cosmeticaalba.es", "pablo@vinosduero.es", "elena@papeleriasol.es", "raul@bodegasribera.es"];
  await db.sequence.deleteMany({ where: { name: { in: nombres } } });
  await db.contact.deleteMany({ where: { email: { in: emails } } });
  revalidatePath("/", "layout");
}

/** Tipo, espera e hilo del paso. */
export async function updateStepSettings(stepId: string, form: FormData) {
  const data = z
    .object({
      type: z.enum(STEP_TYPES),
      delayDays: z.coerce.number().int().min(0).max(90),
      sameThread: z.preprocess((v) => v === "on", z.boolean()),
    })
    .parse({ type: form.get("type"), delayDays: form.get("delayDays"), sameThread: form.get("sameThread") });
  const step = await db.step.update({ where: { id: stepId }, data });
  refresh(step.sequenceId);
}

const contentSchema = z.object({ subject: z.string().default(""), body: z.string().default("") });

// Solo los pasos de WhatsApp mandan estos campos: si no vienen, no se tocan.
const waSchema = z.object({
  waTemplate: z.string().trim().max(512).optional(),
  waLang: z.string().trim().max(15).optional(),
  waParams: z.string().trim().max(1000).optional(),
});

/** Texto de la variante A (el propio paso). */
export async function updateStepContent(stepId: string, form: FormData) {
  const data = contentSchema.parse({ subject: form.get("subject") ?? "", body: form.get("body") ?? "" });
  const wa = waSchema.parse({ waTemplate: form.get("waTemplate") ?? undefined, waLang: form.get("waLang") ?? undefined, waParams: form.get("waParams") ?? undefined });
  if (wa.waLang === "") wa.waLang = "es_AR";
  const step = await db.step.update({ where: { id: stepId }, data: { ...data, ...wa } });
  refresh(step.sequenceId);
}

/** Nueva variante (B, C…) que parte del texto de la A para editarla. */
export async function addVariant(stepId: string) {
  const step = await db.step.findUniqueOrThrow({ where: { id: stepId }, include: { variants: { select: { label: true } } } });
  const label = nextVariantLabel(step.variants.map((v) => v.label));
  if (!label) return;
  await db.stepVariant.create({ data: { stepId, label, subject: step.subject, body: step.body } });
  refresh(step.sequenceId);
  redirect(`/secuencias/${step.sequenceId}?tab=pasos&paso=${stepId}&variante=${label}&creada=1#paso-${stepId}`);
}

export async function updateVariant(id: string, form: FormData) {
  const data = contentSchema.parse({ subject: form.get("subject") ?? "", body: form.get("body") ?? "" });
  const v = await db.stepVariant.update({ where: { id }, data, include: { step: { select: { sequenceId: true } } } });
  refresh(v.step.sequenceId);
}

export async function deleteVariant(id: string) {
  const v = await db.stepVariant.delete({ where: { id }, include: { step: { select: { sequenceId: true } } } });
  refresh(v.step.sequenceId);
  redirect(`/secuencias/${v.step.sequenceId}?tab=pasos&paso=${v.stepId}&borrada=${v.label}#paso-${v.stepId}`);
}

export async function deleteStep(stepId: string) {
  const step = await db.step.delete({ where: { id: stepId } });
  // Renumera los pasos siguientes para que no queden huecos.
  const rest = await db.step.findMany({ where: { sequenceId: step.sequenceId, order: { gt: step.order } }, orderBy: { order: "asc" } });
  for (const s of rest) await db.step.update({ where: { id: s.id }, data: { order: s.order - 1 } });
  refresh(step.sequenceId);
}

/**
 * Inscribe contactos: por etiqueta, o todos si la etiqueta está vacía. Omite bajas, rebotes, ya inscritos y a quien
 * no le llegaría ningún paso (por ejemplo, sin email válido en una secuencia que solo tiene emails).
 */
export async function enrollContacts(sequenceId: string, form: FormData) {
  const tag = String(form.get("tag") ?? "").trim();
  const sequence = await db.sequence.findUniqueOrThrow({ where: { id: sequenceId }, include: { steps: { select: { type: true } } } });
  const first = await db.step.findFirst({ where: { sequenceId }, orderBy: { order: "asc" } });
  if (!first) return;
  const types = new Set(sequence.steps.map((st) => st.type));
  const canEmail: Prisma.ContactWhereInput = { email: { not: null }, OR: [{ emailStatus: null }, { emailStatus: { notIn: ["invalido", "corregible"] } }] };
  const canWa: Prisma.ContactWhereInput = { OR: [{ whatsapp: { not: null } }, { phone: { not: null } }] };
  const reach: Prisma.ContactWhereInput = types.has("TASK") ? {} : { OR: [...(types.has("EMAIL") ? [canEmail] : []), ...(types.has("WHATSAPP") ? [canWa] : [])] };
  const contacts = await db.contact.findMany({
    where: {
      AND: [
        { unsubscribed: false, bounced: false, ...(tag ? { tags: { has: tag } } : {}), enrollments: { none: { sequenceId } } },
        reach,
      ],
    },
    select: { id: true },
  });
  const runAt = nextSendTime(new Date(), first.delayDays, windowFor(sequence));
  await db.enrollment.createMany({
    data: contacts.map((c) => ({ sequenceId, contactId: c.id, nextStep: first.order, nextRunAt: runAt })),
    skipDuplicates: true,
  });
  refresh(sequenceId);
}

export async function setEnrollmentStatus(id: string, status: "ACTIVE" | "PAUSED") {
  const e = await db.enrollment.update({
    where: { id },
    data: { status, ...(status === "ACTIVE" ? { nextRunAt: new Date() } : {}) },
  });
  refresh(e.sequenceId);
}

/** Saca al contacto de la secuencia (su historial de envíos se borra con la inscripción). */
export async function removeEnrollment(id: string) {
  const e = await db.enrollment.delete({ where: { id } });
  await eventoRadar(e.contactId, { k: "fin", motivo: "sacado" });
  refresh(e.sequenceId);
}

/** Guarda las variables del equipo (propias, «si falta» y saludo). Valen para todas las secuencias. */
export async function guardarVariables(input: unknown): Promise<{ ok: true } | { error: string }> {
  const propias = ((input as { propias?: { clave?: unknown }[] })?.propias ?? []).map((p) => String(p?.clave ?? "").trim().toLowerCase());
  const vistas = new Set<string>();
  for (const clave of propias) {
    if (!clave) continue;
    if (!CLAVE_VALIDA.test(clave)) return { error: `«${clave}» no sirve como nombre: usá letras sin tilde, números o guion bajo, empezando con una letra.` };
    if (RESERVADAS.has(clave)) return { error: `{{${clave}}} ya existe: sale de los datos de cada contacto o del envío. Elegí otro nombre.` };
    if (vistas.has(clave)) return { error: `{{${clave}}} está dos veces.` };
    vistas.add(clave);
  }
  const variables = normalizarVariables(input) as Prisma.InputJsonValue;
  await db.setting.upsert({ where: { id: "app" }, update: { variables }, create: { id: "app", variables } });
  revalidatePath("/secuencias", "layout");
  return { ok: true };
}

/** "Redactar con IA": propone el texto de un paso (email o WhatsApp) para Plupack Embalajes. */
export type SugerenciaIA = { asunto: string; texto: string; idea: string };

/**
 * Sugerencias de la IA para un paso: tres versiones distintas (o tres mejoras del borrador, si hay uno) para elegir.
 * `pedido` es lo que se le pide en palabras: «más corto», «más formal», «mencioná el envío gratis»…
 */
export async function redactarConIA(input: { tipo: "EMAIL" | "WHATSAPP" | "TASK"; orden: number; total: number; secuencia: string; borrador?: string; pedido?: string }): Promise<{ opciones: SugerenciaIA[] } | { error: string }> {
  if (!iaConfigurada()) return { error: "La IA todavía no está configurada (falta la clave de la API de Claude en Vercel)." };
  const propias = ((await cargarVariables().catch(() => null))?.propias ?? []).filter((p) => p.clave !== "mi_empresa").slice(0, 12);
  const canal = input.tipo === "EMAIL" ? "email (tono profesional y cercano, 70 a 120 palabras, con asunto corto)" : input.tipo === "WHATSAPP" ? "WhatsApp (tono rioplatense, cercano, 25 a 50 palabras, sin asunto)" : "tarea para el vendedor (qué hacer en la llamada o visita, 1 a 3 frases, con un título corto)";
  const momento = input.orden <= 1 ? "Es el primer contacto: presentate y pedí el contacto de compras." : input.orden >= input.total ? "Es el último mensaje: cerrá con amabilidad y dejá la puerta abierta." : "Es un seguimiento: referí brevemente al mensaje anterior y aportá algo nuevo.";
  const borrador = input.borrador?.trim().slice(0, 1500);
  const pedido = input.pedido?.trim().slice(0, 300);
  const prompt = `Sos vendedor B2B en Argentina de ${process.env.COMPANY_NAME ?? "Plupack Embalajes"} (marca DARTPAC), mayorista de film stretch, film PVC, film de polietileno, bolsas, embalaje y descartables con stock permanente y envíos a todo el país.
Escribí el paso ${input.orden} de ${input.total} de una secuencia de prospección llamada «${input.secuencia}», por ${canal}. ${momento}
Usá estas variables tal cual, con doble llave, donde correspondan: {{saludo}}, {{empresa}}, {{ciudad}}, {{vendedor}}, {{mi_empresa}}.${propias.length ? ` El equipo también tiene estas (usalas solo si encajan): ${propias.map((p) => `{{${p.clave}}} = «${p.valor.slice(0, 80)}»`).join("; ")}.` : ""} No inventes precios, descuentos ni datos.
${input.tipo === "EMAIL" ? "Terminá con una despedida corta (por ejemplo «Saludos,») sin firmar: nada de tu nombre, cargo, empresa ni teléfono al final, porque la firma del remitente se agrega sola debajo.\n" : ""}${borrador ? `Este es el texto actual (tomalo como base, respetando lo que dice): ${borrador}\n` : ""}${pedido ? `Lo que pide el vendedor: ${pedido}\n` : ""}
Dame 3 versiones bien distintas entre sí (por ejemplo: una directa, una que arranque con una pregunta, una que destaque el stock y los envíos)${pedido ? ", todas cumpliendo lo que pide el vendedor" : ""}. En "idea" explicá en pocas palabras qué tiene de distinto cada una.
Respondé solo JSON: {"opciones": [{"idea": "...", "asunto": "...", "texto": "..."}]}.`;
  try {
    const r = await pedirTexto(prompt, { json: true, rapido: true, maxTokens: 2000 });
    const j = parsearJson(r.text) as { opciones?: { asunto?: string; texto?: string; idea?: string }[]; asunto?: string; texto?: string };
    const lista = Array.isArray(j?.opciones) ? j.opciones : j?.texto ? [j] : [];
    const opciones = lista
      .filter((o) => o && typeof o.texto === "string" && o.texto.trim())
      .slice(0, 3)
      .map((o) => ({ asunto: String(o.asunto ?? "").slice(0, 160), texto: String(o.texto).slice(0, 4000), idea: String((o as { idea?: string }).idea ?? "").slice(0, 120) }));
    if (!opciones.length) return { error: "La IA no devolvió sugerencias. Probá de nuevo." };
    return { opciones };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo redactar ahora." };
  }
}
