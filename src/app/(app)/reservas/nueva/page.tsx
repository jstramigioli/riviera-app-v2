import { prisma } from "@/lib/db";
import { NewReservationForm } from "@/components/NewReservationForm";

export default async function NuevaReservaPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    checkIn?: string;
    checkOut?: string;
    unitId?: string;
  }>;
}) {
  const sp = await searchParams;
  const attributes = await prisma.unitAttribute.findMany({
    orderBy: { label: "asc" },
    select: { id: true, key: true, label: true },
  });

  let checkOut = sp.checkOut;
  if (sp.checkIn && !checkOut) {
    const d = new Date(`${sp.checkIn}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    checkOut = d.toISOString().slice(0, 10);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 fade-up">
      <div>
        <h1
          className="text-3xl text-[var(--brand-deep)]"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          Nueva reserva / consulta
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Elegí fechas y mirá en vivo qué habitaciones están libres, qué pensión tiene tarifa y
          filtrá por características.
        </p>
      </div>
      <NewReservationForm
        attributes={attributes}
        initial={{
          checkInDate: sp.checkIn,
          checkOutDate: checkOut,
          physicalUnitId: sp.unitId,
          error: sp.error,
        }}
      />
    </div>
  );
}
