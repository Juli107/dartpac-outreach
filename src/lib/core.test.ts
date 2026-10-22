import { test } from "node:test";
import assert from "node:assert/strict";
import { renderTemplate, unknownVariables } from "./template.ts";
import { nextSendTime, isInWindow, startOfLocalDay } from "./schedule.ts";
import { parseContactsCsv } from "./csv.ts";
import { stripQuoted } from "./strip.ts";
import { withSignature, renderSignature } from "./signature.ts";
import { imageSize } from "./image-size.ts";

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
