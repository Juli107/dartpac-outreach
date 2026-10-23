import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteDoc, NotFound, setDoc, updateDoc, validPath, VersionConflict } from "@/lib/radar/store";

export const dynamic = "force-dynamic";

const Op = z.object({
  op: z.enum(["set", "update", "delete"]),
  c: z.string(),
  id: z.string(),
  d: z.record(z.unknown()).optional(),
  v: z.number().int().positive().optional(),
});
const Body = z.union([Op, z.object({ ops: z.array(Op).min(1).max(100) })]);

/** Escrituras del Radar: set (reemplaza), update (mezcla campos) y delete. Acepta una o varias. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_argument" }, { status: 400 });
  const ops = "ops" in parsed.data ? parsed.data.ops : [parsed.data];
  const out: { id: string; v?: number }[] = [];
  for (const o of ops) {
    if (!validPath(o.c, o.id)) return NextResponse.json({ error: "invalid_argument", detail: `${o.c}/${o.id}` }, { status: 400 });
    try {
      if (o.op === "delete") {
        await deleteDoc(o.c, o.id);
        out.push({ id: o.id });
      } else if (o.op === "set") {
        out.push({ id: o.id, v: await setDoc(o.c, o.id, o.d ?? {}) });
      } else {
        const v = await updateDoc(o.c, o.id, o.d ?? {}, { ifVersion: o.v });
        out.push({ id: o.id, v: v ?? undefined });
      }
    } catch (e) {
      if (e instanceof NotFound) return NextResponse.json({ error: "not_found", detail: `${o.c}/${o.id}` }, { status: 404 });
      if (e instanceof VersionConflict) return NextResponse.json({ error: "conflict", detail: e.message }, { status: 409 });
      throw e;
    }
  }
  return NextResponse.json({ ok: true, docs: out, now: Date.now() });
}
