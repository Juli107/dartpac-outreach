import { NextResponse } from "next/server";
import { runDueSteps } from "@/lib/engine";
import { syncInbox } from "@/lib/inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  // Primero las respuestas, para no enviar un seguimiento a quien acaba de contestar.
  const inbox = await syncInbox().catch((e) => ({ error: String(e) }));
  const steps = await runDueSteps();
  return NextResponse.json({ inbox, steps });
}
