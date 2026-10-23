import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enrolarProspectos } from "@/lib/radar/outreach";
import { quienSoy } from "@/lib/yo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ sequenceId: z.string().min(1), ids: z.array(z.string().min(1)).min(1).max(500) });

/** Suma empresas del Radar a una secuencia de Outreach. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_argument" }, { status: 400 });
  try {
    const yo = await quienSoy();
    const r = await enrolarProspectos(parsed.data.sequenceId, parsed.data.ids, yo?.name.split(/\s+/)[0] ?? "Outreach");
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: "failed_precondition", detail: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
}
