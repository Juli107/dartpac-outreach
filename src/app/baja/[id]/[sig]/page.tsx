import { db } from "@/lib/db";
import { verifyId } from "@/lib/tokens";
import { eventoRadar } from "@/lib/radar/outreach";

export const metadata = { title: "Baja" };

export default async function Unsubscribe({ params }: { params: Promise<{ id: string; sig: string }> }) {
  const { id, sig } = await params;
  let ok = false;
  if (verifyId(id, sig)) {
    const updated = await db.contact.updateMany({ where: { id }, data: { unsubscribed: true } });
    await db.enrollment.updateMany({ where: { contactId: id, status: "ACTIVE" }, data: { status: "UNSUBSCRIBED", nextRunAt: null } });
    ok = updated.count > 0;
    if (ok) await eventoRadar(id, { k: "baja" });
  }
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="card max-w-md p-8 text-center">
        <h1>{ok ? "Te has dado de baja" : "Enlace no válido"}</h1>
        <p className="sub mt-2">
          {ok ? `No volverás a recibir correos comerciales de ${process.env.COMPANY_NAME ?? "Plupack Embalajes"}.` : "Este enlace de baja no es correcto o ha caducado."}
        </p>
      </div>
    </div>
  );
}
