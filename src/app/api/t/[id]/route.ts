import { db } from "@/lib/db";

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const msg = await db.message.findUnique({ where: { id }, select: { openedAt: true } });
  if (msg) {
    await db.message.update({
      where: { id },
      data: { openCount: { increment: 1 }, openedAt: msg.openedAt ?? new Date() },
    });
  }
  return new Response(PIXEL, {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" },
  });
}
