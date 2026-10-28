import { NextResponse, after, type NextRequest } from "next/server";
import { firmaValida, leerAviso } from "@/lib/whatsapp-bot";
import { recibirWhatsApp } from "@/lib/whatsapp-inbound";

export const maxDuration = 60;

/** Meta comprueba el webhook una vez: devuelve el desafío si el token coincide con WHATSAPP_VERIFY_TOKEN. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (p.get("hub.mode") === "subscribe" && token && p.get("hub.verify_token") === token) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("forbidden", { status: 403 });
}

/** Avisos de Meta: mensajes nuevos de clientes. Se responde enseguida y se procesan después. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!firmaValida(raw, req.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET ?? "")) {
    return new NextResponse("firma inválida", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("ok");
  }
  const mensajes = leerAviso(body);
  after(async () => {
    for (const m of mensajes) {
      await recibirWhatsApp(m).catch((e) => console.error("WhatsApp entrante", e));
    }
  });
  return new NextResponse("ok");
}
