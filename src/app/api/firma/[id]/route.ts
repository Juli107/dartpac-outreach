import { db } from "@/lib/db";

// Imagen de la firma: pública para que la vean los destinatarios.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sender = await db.sender.findUnique({ where: { id }, select: { signatureImage: true, signatureImageType: true } });
  if (!sender?.signatureImage || !sender.signatureImageType) return new Response("No encontrada", { status: 404 });
  return new Response(new Uint8Array(sender.signatureImage), {
    headers: {
      "Content-Type": sender.signatureImageType,
      // La URL lleva ?v=, así que puede guardarse en caché mucho tiempo.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
