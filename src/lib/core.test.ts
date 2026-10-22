import { test } from "node:test";
import assert from "node:assert/strict";
import { renderTemplate, unknownVariables } from "./template.ts";
import { nextSendTime, isInWindow, startOfLocalDay } from "./schedule.ts";
import { parseContactsCsv } from "./csv.ts";
import { stripQuoted } from "./strip.ts";
import { withSignature, renderSignature } from "./signature.ts";
import { imageSize } from "./image-size.ts";
import { authUrl, readIdToken, DomainError, GMAIL_SCOPE } from "./google.ts";

const marta = { email: "marta@logisur.es", firstName: "Marta", company: "Logisur" };
const madrid = { startHour: 8, endHour: 19, timeZone: "Europe/Madrid" };

test("renderTemplate sustituye variables y usa el valor por defecto", () => {
  assert.equal(renderTemplate("Hola {{nombre}} de {{ empresa }}", marta), "Hola Marta de Logisur");
  assert.equal(renderTemplate("Hola {{cargo|equipo}}", marta), "Hola equipo");
  assert.equal(renderTemplate("{{desconocida}}", marta), "{{desconocida}}");
  assert.deepEqual(unknownVariables("{{nombre}} {{ciudad}}"), ["ciudad"]);
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
    signatureImageHeight: 256, signatureImageMode: "LOGO", signatureImageVersion: 3,
  };
  const { text, html } = renderSignature(sender, "Plupack Embalajes", "https://app.test");
  assert.equal(text, "Ailén <Nardone>\nComercial · Plupack Embalajes\n+54 9 11 5555-1234 · plupackembalajes.com");
  assert.match(html, /src="https:\/\/app\.test\/api\/firma\/s1\?v=3" width="64" height="64"/);
  assert.match(html, /Ailén &lt;Nardone&gt;/);
  assert.match(html, /href="tel:\+5491155551234"/);
  const full = renderSignature({ ...sender, signatureImageMode: "FULL", signatureImageWidth: 960, signatureImageHeight: 240 }, "P", "");
  assert.match(full.html, /width="480" height="120"/);
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
