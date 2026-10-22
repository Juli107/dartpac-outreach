// Datos de ejemplo para ver la app con contenido. Ejecuta: npm run db:seed
import { PrismaClient, type ReplyLabel } from "@prisma/client";

const db = new PrismaClient();

const contacts = [
  ["marta@logisur.es", "Marta", "Ruiz", "Logisur", "Jefa de compras", "distribuidores"],
  ["jorge@tiendasnordica.es", "Jorge", "Vidal", "Tiendas Nórdica", "Director de operaciones", "ecommerce"],
  ["lucia@frutaslevante.es", "Lucía", "Gómez", "Frutas Levante", "Responsable de almacén", "distribuidores"],
  ["andres@mueblespena.es", "Andrés", "Peña", "Muebles Peña", "Gerente", "clientes-2025"],
  ["sara@cosmeticaalba.es", "Sara", "Molina", "Cosmética Alba", "Compras", "ecommerce"],
  ["pablo@vinosduero.es", "Pablo", "Herrero", "Vinos Duero", "Logística", "feria-hispack"],
  ["elena@papeleriasol.es", "Elena", "Castro", "Papelería Sol", "Gerente", "ecommerce"],
  ["raul@bodegasribera.es", "Raúl", "Ibáñez", "Bodegas Ribera", "Director", "feria-hispack"],
];

async function main() {
  for (const [email, firstName, lastName, company, title, tag] of contacts) {
    await db.contact.upsert({ where: { email }, update: {}, create: { email, firstName, lastName, company, title, tags: [tag] } });
  }
  const existing = await db.sequence.findFirst({ where: { name: "Distribuidores de embalaje · Q4" } });
  if (existing) return;

  const seq = await db.sequence.create({
    data: {
      name: "Distribuidores de embalaje · Q4",
      status: "ACTIVE",
      signature: "Un saludo,\nJulián\nPlupack Embalajes · plupackembalajes.com",
      steps: {
        create: [
          { order: 1, delayDays: 0, subject: "{{empresa}} y sus envíos de temporada", body: "Hola {{nombre}},\n\nEn Plupack Embalajes preparamos cajas y film a medida para picos de campaña, con entrega en 48 h.\n\n¿Te va bien una llamada de 15 minutos esta semana?" },
          { order: 2, delayDays: 3, subject: "", body: "Hola {{nombre}},\n\nTe escribo de nuevo por si se perdió mi mensaje. Puedo enviarte muestras sin coste." },
          { order: 3, delayDays: 2, type: "TASK", subject: "Llamar a {{nombre}} ({{empresa}})", body: "Ofrecer muestras de caja de doble canal." },
          { order: 4, delayDays: 5, subject: "", body: "Hola {{nombre}},\n\nÚltimo mensaje por mi parte. Te dejo nuestro catálogo por si en algún momento os encaja." },
        ],
      },
    },
    include: { steps: true },
  });
  await db.sequence.create({ data: { name: "Ecommerce · cajas personalizadas", status: "DRAFT", steps: { create: { order: 1, subject: "Cajas con tu marca para {{empresa}}", body: "Hola {{nombre}},\n\n¿Estáis enviando con cajas genéricas?\n\nUn saludo" } } } });

  const all = await db.contact.findMany();
  const step1 = seq.steps.find((s) => s.order === 1)!;
  const now = Date.now();
  for (const [i, c] of all.entries()) {
    const enr = await db.enrollment.create({
      data: { sequenceId: seq.id, contactId: c.id, nextStep: 2, nextRunAt: new Date(now + (i + 1) * 3600_000) },
    });
    await db.message.create({
      data: {
        enrollmentId: enr.id,
        stepId: step1.id,
        messageId: `<seed-${i}@dartpac.local>`,
        subject: `${c.company} y sus envíos de temporada`,
        sentAt: new Date(now - (i % 7) * 86400_000 * 3),
        openedAt: i % 2 === 0 ? new Date(now - 3600_000) : null,
        openCount: i % 2 === 0 ? 1 : 0,
      },
    });
  }
  const replies: [string, ReplyLabel, string][] = [
    ["jorge@tiendasnordica.es", "INTERESTED", "Sí, nos interesa. ¿Podéis mandar muestras de la caja de 30×20?"],
    ["elena@papeleriasol.es", "LATER", "Ahora no, escríbeme en enero que renovamos proveedor."],
    ["raul@bodegasribera.es", "MEETING", "El jueves a las 10 me va bien."],
  ];
  for (const [i, [email, label, body]] of replies.entries()) {
    const c = all.find((x) => x.email === email)!;
    await db.reply.create({ data: { contactId: c.id, messageId: `<seed-reply-${i}@example.com>`, subject: "Re: envíos de temporada", body, label, receivedAt: new Date(now - i * 5 * 3600_000) } });
    await db.enrollment.updateMany({ where: { contactId: c.id }, data: { status: "REPLIED", nextRunAt: null } });
  }
}

main().finally(() => db.$disconnect());
