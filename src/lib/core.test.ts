import { test } from "node:test";
import assert from "node:assert/strict";
import { renderTemplate, unknownVariables } from "./template.ts";
import { nextSendTime, isInWindow, startOfLocalDay } from "./schedule.ts";
import { parseContactsCsv } from "./csv.ts";
import { stripQuoted } from "./strip.ts";
import { withSignature, renderSignature, sinFirmaRepetida } from "./signature.ts";
import { imageSize } from "./image-size.ts";
import { nombreDeCopia } from "./labels.ts";
import { authUrl, readIdToken, DomainError, GMAIL_SCOPE } from "./google.ts";
import { sendWaTemplate, waApiReady, waParamList } from "./whatsapp-api.ts";
import { atribuir, agrupar, ranking, tiempos, franja, VARIABLES, csvEnvios, type Envio } from "./analisis.ts";

const marta = { email: "marta@logisur.es", firstName: "Marta", company: "Logisur" };
const madrid = { startHour: 8, endHour: 19, timeZone: "Europe/Madrid" };

test("renderTemplate sustituye variables y usa el valor por defecto", () => {
  assert.equal(renderTemplate("Hola {{nombre}} de {{ empresa }}", marta), "Hola Marta de Logisur");
  assert.equal(renderTemplate("Hola {{cargo|equipo}}", marta), "Hola equipo");
  assert.equal(renderTemplate("{{desconocida}}", marta), "{{desconocida}}");
  assert.deepEqual(unknownVariables("{{nombre}} {{ciudad}} {{color}}"), ["color"]);
});

test("nextSendTime salta el fin de semana y la noche", () => {
  // Viernes 23 oct 2026, 20:00 en Madrid (18:00 UTC) → lunes 26 a las 8:00 (07:00 UTC, ya en horario de invierno)
  const t = nextSendTime(new Date("2026-10-23T18:00:00Z"), 0, madrid);
  assert.equal(t.toISOString(), "2026-10-26T07:00:00.000Z");
  assert.ok(isInWindow(new Date("2026-10-22T10:00:00Z"), madrid));
  assert.ok(!isInWindow(new Date("2026-10-24T10:00:00Z"), madrid));
});

test("nextSendTime aplica la espera en días", () => {
  const t = nextSendTime(new Date("2026-10-19T09:00:00Z"), 3, madrid);
  assert.equal(t.toISOString(), "2026-10-22T09:00:00.000Z");
});

test("parseContactsCsv reconoce cabeceras en español y descarta filas malas", () => {
  const csv = "Correo,Nombre,Empresa,Teléfono\nMARTA@logisur.es,Marta,Logisur,600\nsin-email,,X,\nmarta@logisur.es,Repe,Y,";
  const { contacts, skipped } = parseContactsCsv(csv);
  assert.equal(contacts.length, 1);
  assert.equal(skipped, 2);
  assert.deepEqual(contacts[0], { email: "marta@logisur.es", firstName: "Marta", lastName: undefined, company: "Logisur", title: undefined, phone: "600" });
});

test("stripQuoted quita la cita del correo original", () => {
  const body = "Sí, nos interesa.\n\nEl jue, 22 oct 2026 a las 10:00, Dartpac escribió:\n> Hola Jorge";
  assert.equal(stripQuoted(body), "Sí, nos interesa.");
});

test("withSignature añade la firma solo si existe", () => {
  assert.equal(withSignature("Hola\n", "Julián\nPlupack"), "Hola\n\nJulián\nPlupack");
  assert.equal(withSignature("Hola", "  "), "Hola");
});

test("encryptSecret y decryptSecret recuperan la contraseña", async () => {
  process.env.ENCRYPTION_KEY = "clave-de-prueba";
  const { encryptSecret, decryptSecret } = await import("./crypto.ts");
  const stored = encryptSecret("abcdefghijklmnop");
  assert.notEqual(stored, "abcdefghijklmnop");
  assert.notEqual(encryptSecret("abcdefghijklmnop"), stored);
  assert.equal(decryptSecret(stored), "abcdefghijklmnop");
});

test("startOfLocalDay usa la medianoche de la zona horaria de envío", () => {
  // 22 oct 2026, 01:30 UTC = 21 oct, 22:30 en Buenos Aires → medianoche del 21 (03:00 UTC)
  const d = startOfLocalDay(new Date("2026-10-22T01:30:00Z"), "America/Argentina/Buenos_Aires");
  assert.equal(d.toISOString(), "2026-10-21T03:00:00.000Z");
});

test("renderSignature arma la firma en texto y HTML con la imagen alojada", () => {
  const sender = {
    id: "s1", name: "Ailén <Nardone>", email: "ailen@x.com", jobTitle: "Comercial", phone: "+54 9 11 5555-1234",
    website: "plupackembalajes.com", signature: "", signatureImageType: "image/png", signatureImageWidth: 256,
    signatureImageHeight: 256, signatureImageMode: "DATOS", signatureImageVersion: 3,
  };
  const { text, html } = renderSignature(sender, "Plupack Embalajes", "https://app.test");
  assert.equal(text, "Ailén <Nardone>\nComercial · Plupack Embalajes\n+54 9 11 5555-1234 · plupackembalajes.com");
  assert.match(html, /src="https:\/\/app\.test\/api\/firma\/s1\?v=3" width="64" height="64"/);
  assert.match(html, /Ailén &lt;Nardone&gt;/);
  assert.match(html, /href="tel:\+5491155551234"/);
  const full = renderSignature({ ...sender, signatureImageMode: "IMAGEN", signatureImageWidth: 960, signatureImageHeight: 240 }, "P", "");
  assert.match(full.html, /width="480" height="120"/);
  // solo la imagen (y así quedan las de antes): nada escrito al lado, aunque el texto plano siga llevando los datos
  for (const mode of ["IMAGEN", "LOGO", "FULL"]) {
    const sola = renderSignature({ ...sender, signatureImageMode: mode }, "Plupack Embalajes", "");
    assert.doesNotMatch(sola.html, /<td|font-size|Comercial|tel:/); // (el nombre solo va en el alt de la imagen)
    assert.match(sola.html, /width="200" height="200"/);
    assert.match(sola.text, /Comercial · Plupack Embalajes/);
  }
  // sin imagen, los datos van en texto
  assert.match(renderSignature({ ...sender, signatureImageType: null, signatureImageMode: "IMAGEN" }, "P", "").html, /Comercial · P/);
});

test("sinFirmaRepetida saca del final la firma que ya va abajo", () => {
  const julian = { name: "Julián Cuello", email: "julian@plupackembalajes.com", jobTitle: "Ventas", phone: "+54 9 11 5555-1234", website: "" };
  const emp = ["Plupack Embalajes"];
  const f = (b: string) => sinFirmaRepetida(b, julian, emp);
  const cuerpo = "Buenos días,\n\nLes escribo por el film stretch.";
  assert.equal(f(`${cuerpo}\n\nSaludos,\nJulián\nPlupack Embalajes`), `${cuerpo}\n\nSaludos,\nJulián`);
  assert.equal(f(`${cuerpo}\n\nSaludos,\nJulián Cuello | Plupack Embalajes`), `${cuerpo}\n\nSaludos,\nJulián Cuello`);
  assert.equal(f(`${cuerpo}\n\nSaludos,\nJulian Cuello\nVentas · Plupack Embalajes (DARTPAC)\nCel: 11 5555-1234 · www.plupackembalajes.com\n`), `${cuerpo}\n\nSaludos,\nJulian Cuello`);
  assert.equal(f(`${cuerpo}\n\nSaludos cordiales, Julián - Plupack Embalajes`), `${cuerpo}\n\nSaludos cordiales, Julián`);
  assert.equal(f(`${cuerpo}\n\n--\nJulián Cuello\nPlupack Embalajes`), cuerpo);
  // lo que no es una firma repetida queda igual
  for (const b of [
    `${cuerpo}\n\nSaludos,\nJulián`,
    `${cuerpo}\n\nSaludos, Julián.`,
    `${cuerpo}\n\nSaludos,\nPlupack Embalajes`,
    `${cuerpo}\n\nSaludos,\nJulián\nPlupack Embalajes · Av. Rivadavia 1234`,
    `${cuerpo}\n\nCualquier duda, escríbanle a Julián.`,
    `${cuerpo}\n\nSaludos,\nJulián\nCel: 11 4444-0000`,
    `${cuerpo}\n\nSaludos,\nJuliana\nPlupack Embalajes`,
  ]) assert.equal(f(b), b);
});

test("imageSize lee el tamaño de un PNG", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0, 0, 0, 0, 0x80, 8]);
  assert.deepEqual(imageSize(png), { type: "image/png", width: 256, height: 128 });
  assert.equal(imageSize(Uint8Array.from([1, 2, 3])), null);
});

test("readIdToken acepta solo cuentas verificadas del dominio y para esta app", () => {
  process.env.GOOGLE_CLIENT_ID = "cliente-123";
  const token = (claims: Record<string, unknown>) =>
    `x.${Buffer.from(JSON.stringify({ iss: "https://accounts.google.com", aud: "cliente-123", exp: 2000, email_verified: true, ...claims })).toString("base64url")}.y`;
  const now = 1000 * 1000;
  assert.deepEqual(readIdToken(token({ email: "Enzo@plupackembalajes.com", name: "Enzo Ayala" }), now), { email: "enzo@plupackembalajes.com", name: "Enzo Ayala" });
  assert.throws(() => readIdToken(token({ email: "x@gmail.com" }), now), DomainError);
  assert.throws(() => readIdToken(token({ email: "x@plupackembalajes.com.ar" }), now), DomainError);
  assert.throws(() => readIdToken(token({ email: "enzo@plupackembalajes.com", aud: "otro" }), now), /no es para esta app/);
  assert.throws(() => readIdToken(token({ email: "enzo@plupackembalajes.com", exp: 10 }), now), /caducó/);
  assert.throws(() => readIdToken(token({ email: "enzo@plupackembalajes.com", email_verified: false }), now), /no confirmó/);
});

test("authUrl pide Gmail y permiso permanente solo al conectar", () => {
  const login = new URL(authUrl({ mode: "login", state: "s", redirectUri: "https://app.test/api/google/callback" }));
  assert.equal(login.searchParams.get("scope"), "openid email profile");
  assert.equal(login.searchParams.get("access_type"), null);
  assert.equal(login.searchParams.get("hd"), "plupackembalajes.com");
  const connect = new URL(authUrl({ mode: "connect", state: "s", redirectUri: "https://app.test/cb", loginHint: "ailen@plupackembalajes.com" }));
  assert.ok(connect.searchParams.get("scope")!.split(" ").includes(GMAIL_SCOPE));
  assert.equal(connect.searchParams.get("access_type"), "offline");
  assert.equal(connect.searchParams.get("prompt"), "consent");
  assert.equal(connect.searchParams.get("login_hint"), "ailen@plupackembalajes.com");
});

test("windowFor respeta los días de envío de la secuencia", async () => {
  const { windowFor } = await import("./schedule.ts");
  const w = windowFor({ timeZone: "America/Argentina/Buenos_Aires", startHour: 9, endHour: 18, sendDays: [6] });
  // Sábado 24 oct 2026, 12:00 en Buenos Aires (15:00 UTC): dentro. El jueves a la misma hora, fuera.
  assert.ok(isInWindow(new Date("2026-10-24T15:00:00Z"), w));
  assert.ok(!isInWindow(new Date("2026-10-22T15:00:00Z"), w));
  // Sin días guardados, de lunes a viernes.
  const weekdays = windowFor({ timeZone: "America/Argentina/Buenos_Aires", startHour: 8, endHour: 19, sendDays: [] });
  assert.ok(isInWindow(new Date("2026-10-22T15:00:00Z"), weekdays));
  assert.equal(nextSendTime(new Date("2026-10-22T15:00:00Z"), 0, w).toISOString(), "2026-10-24T12:00:00.000Z");
});

test("variantes: A es el paso, el reparto es estable y las letras siguen en orden", async () => {
  const { stepVariants, pickVariant, nextVariantLabel, stepDays } = await import("./variants.ts");
  const vs = stepVariants({ subject: "Hola", body: "x", variants: [{ label: "C", subject: "c", body: "c" }, { label: "B", subject: "b", body: "b" }] });
  assert.deepEqual(vs.map((v) => v.label), ["A", "B", "C"]);
  assert.equal(pickVariant("enr1:step1", vs).label, pickVariant("enr1:step1", vs).label);
  const counts = { A: 0, B: 0, C: 0 } as Record<string, number>;
  for (let i = 0; i < 3000; i++) counts[pickVariant(`e${i}:s`, vs).label]++;
  for (const n of Object.values(counts)) assert.ok(n > 800 && n < 1200, `reparto desigual: ${JSON.stringify(counts)}`);
  assert.equal(nextVariantLabel(["B", "C"]), "D");
  assert.deepEqual(stepDays([{ delayDays: 0 }, { delayDays: 3 }, { delayDays: 4 }]), [1, 4, 8]);
});

test("rebotes: rechazo permanente y direcciones del aviso", async () => {
  const { isHardBounce, bouncedAddresses, isBounceSender } = await import("./bounce.ts");
  assert.ok(isHardBounce("550 5.1.1 The email account that you tried to reach does not exist"));
  assert.ok(!isHardBounce("421 4.7.0 Try again later"));
  assert.ok(isBounceSender("mailer-daemon@googlemail.com"));
  assert.deepEqual(bouncedAddresses("No se entregó a ana@cliente.com.ar", "ana@cliente.com.ar"), ["ana@cliente.com.ar"]);
  assert.deepEqual(bouncedAddresses("From: mailer-daemon@googlemail.com"), []);
});

test("scheduleLabel resume el horario", async () => {
  const { scheduleLabel } = await import("./labels.ts");
  assert.equal(scheduleLabel({ timeZone: "America/Argentina/Buenos_Aires", startHour: 8, endHour: 19, sendDays: [5, 1, 2, 3, 4] }), "Argentina · L–V · 8–19 h");
  assert.equal(scheduleLabel({ timeZone: "Europe/Madrid", startHour: 9, endHour: 14, sendDays: [6, 1] }), "España · L S · 9–14 h");
});

test("variables del envío: saludo según la hora, vendedor y datos de la empresa", () => {
  const ctx = { sender: { name: "Luis Mendieta" }, now: new Date("2026-10-23T13:00:00Z"), timeZone: "America/Argentina/Buenos_Aires" };
  assert.equal(renderTemplate("{{saludo}}, {{empresa}}. Soy {{vendedor}}", { company: "Logisur" }, ctx), "Buenos días, Logisur. Soy Luis");
  assert.equal(renderTemplate("{{saludo}}", {}, { now: new Date("2026-10-23T18:30:00Z"), timeZone: "America/Argentina/Buenos_Aires" }), "Buenas tardes");
  assert.equal(renderTemplate("Hola {{nombre|}} de {{ciudad|tu zona}}", { city: "Haedo" }), "Hola  de Haedo");
  assert.equal(renderTemplate("{{web}}", { website: "https://plupack.com.ar/" }), "plupack.com.ar");
});

test("waNum arma el número internacional de WhatsApp", async () => {
  const { waNum } = await import("./whatsapp.ts");
  assert.equal(waNum("011 15-4444-5555"), "5491144445555");
  assert.equal(waNum("+54 9 11 4444-5555"), "5491144445555");
  assert.equal(waNum("(0351) 15 555-1234"), "5493515551234");
  assert.equal(waNum("0261 4234567"), "5492614234567");
  assert.equal(waNum("123"), "");
});

test("verificador: tipeos, inválidos y riesgosos (sin red)", async () => {
  const { verificarLocal, sePuedeEnviar } = await import("./verifier/index.ts");
  assert.equal(verificarLocal("ventas@gmial.com").estado, "corregible");
  assert.equal(verificarLocal("ventas@gmial.com").sugerencia, "ventas@gmail.com");
  assert.equal(verificarLocal("juan@@x.com").estado, "invalido");
  assert.equal(verificarLocal("compras@fibertel.com.ar").estado, "riesgoso");
  assert.equal(verificarLocal("compras@plupackembalajes.com").estado, "valido");
  assert.equal(sePuedeEnviar({ email: "a@b.com", emailStatus: "invalido" }), false);
  assert.equal(sePuedeEnviar({ email: "a@b.com", emailStatus: null }), true);
  assert.equal(sePuedeEnviar({ email: null, emailStatus: null }), false);
});

test("variables del equipo: propias, «si falta», saludo propio y nombres con números", () => {
  const vars = {
    propias: [{ clave: "catalogo", valor: "plupack.com.ar/catalogo" }, { clave: "oferta_2", valor: "10 % en la primera compra" }, { clave: "mi_empresa", valor: "DARTPAC" }],
    siFalta: { nombre: "equipo de compras", ciudad: "tu zona" },
    saludo: { manana: "Buen día" },
  };
  const ctx = { vars, now: new Date("2026-10-26T13:00:00Z"), timeZone: "America/Argentina/Buenos_Aires" };
  assert.equal(renderTemplate("{{saludo}}, {{nombre}}: {{catalogo}} · {{oferta_2}} — {{mi_empresa}}", {}, ctx), "Buen día, equipo de compras: plupack.com.ar/catalogo · 10 % en la primera compra — DARTPAC");
  // el valor puntual del mensaje gana al «si falta» general, también cuando es vacío a propósito
  assert.equal(renderTemplate("Hola {{nombre|amigos}} de {{ciudad}}", {}, ctx), "Hola amigos de tu zona");
  assert.equal(renderTemplate("Hola {{nombre|}}!", {}, ctx), "Hola !");
  // con el dato, el «si falta» no se usa; la tarde sigue con el texto de fábrica
  assert.equal(renderTemplate("{{saludo}}, {{nombre}}", { firstName: "Marta" }, { ...ctx, now: new Date("2026-10-26T18:00:00Z") }), "Buenas tardes, Marta");
  assert.deepEqual(unknownVariables("{{catalogo}} {{oferta_2}} {{color}}", ["catalogo", "oferta_2"]), ["color"]);
});

test("nombre libre para la copia de una secuencia", () => {
  assert.equal(nombreDeCopia("Frigoríficos", []), "Frigoríficos (copia)");
  assert.equal(nombreDeCopia("Frigoríficos", ["Frigoríficos (copia)"]), "Frigoríficos (copia 2)");
  assert.equal(nombreDeCopia("Frigoríficos (copia)", ["Frigoríficos (copia)", "Frigoríficos (copia 2)"]), "Frigoríficos (copia 3)");
});

function envio(i: number, extra: Partial<Envio> = {}): Omit<Envio, "reply"> {
  return {
    id: `m${i}`, contactId: `c${i}`, messageId: `<m${i}@x>`, sentAt: new Date("2026-10-26T13:00:00Z"), timeZone: "America/Argentina/Buenos_Aires",
    step: 2, threaded: true, variant: "A", subjectTpl: "Hola {{nombre}}", bodyTpl: "texto corto", sender: "Luis", sequence: "S", plainText: false,
    opened: false, province: null, city: null, rubro: null, title: null, ...extra,
  };
}

test("atribuir usa In-Reply-To y, si falta, el último email antes de la respuesta", () => {
  const a = envio(1, { sentAt: new Date("2026-10-20T12:00:00Z") });
  const b = envio(2, { contactId: "c1", sentAt: new Date("2026-10-22T12:00:00Z") });
  const r1 = atribuir([a, b], [{ contactId: "c1", inReplyTo: "<m1@x>", receivedAt: new Date("2026-10-23T12:00:00Z"), label: "NEW" }]);
  assert.ok(r1[0].reply && !r1[1].reply);
  const r2 = atribuir([a, b], [{ contactId: "c1", inReplyTo: null, receivedAt: new Date("2026-10-23T12:00:00Z"), label: "MEETING" }]);
  assert.ok(!r2[0].reply && r2[1].reply?.label === "MEETING");
  // una respuesta anterior a todos los envíos no se le asigna a ninguno
  const r3 = atribuir([a], [{ contactId: "c1", inReplyTo: null, receivedAt: new Date("2026-10-01T12:00:00Z"), label: "NEW" }]);
  assert.equal(r3[0].reply, null);
});

test("agrupar y ranking comparan hilo contra correo nuevo", () => {
  const resp = { at: new Date("2026-10-26T15:00:00Z"), label: "INTERESTED" };
  const envios: Envio[] = [
    ...Array.from({ length: 20 }, (_, i) => ({ ...envio(i), reply: i < 5 ? resp : null })),
    ...Array.from({ length: 20 }, (_, i) => ({ ...envio(100 + i, { threaded: false }), reply: i < 1 ? resp : null })),
    { ...envio(999, { step: 1, threaded: false }), reply: null },
  ];
  const hilo = agrupar(envios, VARIABLES.find((v) => v.id === "hilo")!);
  assert.deepEqual(hilo.map((g) => [g.key, g.sent, g.replied, g.positive]), [["En el mismo hilo (Re:)", 20, 5, 5], ["Correo nuevo", 20, 1, 1]]);
  const top = ranking(envios).find((g) => g.variable.id === "hilo")!;
  assert.equal(top.mejor.key, "En el mismo hilo (Re:)");
  assert.equal(top.chico, true);
  assert.equal(tiempos(envios).mediana, 2);
  assert.ok(csvEnvios(envios.map((e) => ({ ...e, email: "a@b.com", company: "X, S.A." }))).includes('"X, S.A."'));
});

test("franja horaria", () => {
  assert.equal(franja(9), "8 a 10 h");
  assert.equal(franja(18), "16 a 19 h");
  assert.equal(franja(20), "Después de las 19 h");
});

test("WhatsApp automático: doble llave y plantilla con sus variables", async () => {
  const env = { ...process.env };
  try {
    delete process.env.WHATSAPP_ENVIO;
    process.env.WHATSAPP_TOKEN = "t";
    assert.equal(waApiReady({ waPhoneNumberId: "123" }), false, "sin WHATSAPP_ENVIO no sale nada");
    process.env.WHATSAPP_ENVIO = "encendido";
    assert.equal(waApiReady({ waPhoneNumberId: "" }), false, "sin número conectado tampoco");
    assert.equal(waApiReady({ waPhoneNumberId: "123" }), true);
    assert.deepEqual(waParamList(" {{nombre}} , {{mi_nombre}},"), ["{{nombre}}", "{{mi_nombre}}"]);

    const real = globalThis.fetch;
    let pedido: { url: string; body: any } | null = null;
    globalThis.fetch = (async (url: string, init: { body: string }) => {
      pedido = { url, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 });
    }) as typeof fetch;
    try {
      const id = await sendWaTemplate({ phoneNumberId: "123", to: "5491170396659", template: "primer_contacto", lang: "es_AR", params: ["Marta", ""] });
      assert.equal(id, "wamid.1");
      assert.match(pedido!.url, /\/123\/messages$/);
      assert.equal(pedido!.body.template.name, "primer_contacto");
      assert.deepEqual(pedido!.body.template.components[0].parameters.map((x: { text: string }) => x.text), ["Marta", "-"]);
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: "Template name does not exist", code: 132001 } }), { status: 404 })) as unknown as typeof fetch;
      await assert.rejects(sendWaTemplate({ phoneNumberId: "123", to: "549", template: "x", lang: "es_AR", params: [] }), /Template name does not exist \(código 132001\)/);
    } finally {
      globalThis.fetch = real;
    }
  } finally {
    process.env = env;
  }
});

test("bot de WhatsApp: aviso de Meta, firma, pausa y conversación", async () => {
  const { leerAviso, firmaValida, botEnPausa, ventanaAbierta, conversacionBot, botEncendido } = await import("./whatsapp-bot.ts");
  const { createHmac } = await import("node:crypto");
  const aviso = {
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "123" },
      contacts: [{ wa_id: "5491133894270", profile: { name: "Ana Pérez" } }],
      messages: [
        { from: "5491133894270", id: "wamid.1", timestamp: "1761670000", type: "text", text: { body: " Hola, precio de cajas? " } },
        { from: "5491133894270", id: "wamid.2", timestamp: "1761670001", type: "audio", audio: { id: "x" } },
      ],
      statuses: [{ id: "wamid.0", status: "read" }],
    } }] }],
  };
  const ms = leerAviso(aviso);
  assert.equal(ms.length, 2);
  assert.deepEqual([ms[0].phoneNumberId, ms[0].from, ms[0].name, ms[0].text], ["123", "5491133894270", "Ana Pérez", "Hola, precio de cajas?"]);
  assert.equal(ms[1].text, "");
  assert.equal(ms[1].type, "audio");
  assert.deepEqual(leerAviso({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] }), []);
  assert.deepEqual(leerAviso("basura"), []);

  const raw = JSON.stringify(aviso);
  const sig = "sha256=" + createHmac("sha256", "secreto").update(raw).digest("hex");
  assert.ok(firmaValida(raw, sig, "secreto"));
  assert.ok(!firmaValida(raw, sig, "otro"));
  assert.ok(!firmaValida(raw + " ", sig, "secreto"));
  assert.ok(!firmaValida(raw, null, "secreto"));
  assert.ok(!firmaValida(raw, sig, ""));

  const ahora = new Date("2026-10-28T15:00:00Z");
  const h = (horas: number) => new Date(ahora.getTime() - horas * 3600_000);
  const hist = [
    { direction: "in", by: "cliente", body: "Hola", at: h(3) },
    { direction: "out", by: "bot", body: "¡Hola! ¿Qué necesitás?", at: h(2.9) },
    { direction: "in", by: "cliente", body: "Cajas", at: h(1) },
    { direction: "in", by: "cliente", body: "500 unidades", at: h(0.9) },
  ];
  assert.ok(!botEnPausa(hist, ahora));
  assert.ok(botEnPausa([...hist, { direction: "out", by: "persona", body: "Te llamo", at: h(11) }], ahora));
  assert.ok(!botEnPausa([...hist, { direction: "out", by: "persona", body: "Te llamo", at: h(13) }], ahora));
  assert.ok(ventanaAbierta(hist, ahora));
  assert.ok(!ventanaAbierta([{ direction: "in", by: "cliente", body: "x", at: h(25) }], ahora));
  assert.deepEqual(conversacionBot([{ direction: "out", by: "bot", body: "previo", at: h(5) }, ...hist]), [
    { role: "user", content: "Hola" },
    { role: "assistant", content: "¡Hola! ¿Qué necesitás?" },
    { role: "user", content: "Cajas\n500 unidades" },
  ]);

  const antes = { ...process.env };
  process.env.WHATSAPP_TOKEN = "t";
  delete process.env.WHATSAPP_BOT;
  assert.ok(!botEncendido());
  process.env.WHATSAPP_BOT = "encendido";
  assert.ok(botEncendido());
  process.env = antes;
});
