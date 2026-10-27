import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { RESERVATION_STATUS_LABEL } from "@/lib/status";

export default async function HuespedDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const guest = await prisma.guest.findUnique({
    where: { id },
    include: {
      reservations: {
        include: { reservation: true },
        orderBy: { reservation: { checkInDate: "desc" } },
      },
    },
  });
  if (!guest) notFound();

  return (
    <div className="space-y-4 fade-up">
      <Link href="/huespedes" className="text-xs text-[var(--muted)]">
        ← Huéspedes
      </Link>
      <h1
        className="text-3xl text-[var(--brand-deep)]"
        style={{ fontFamily: "var(--font-display), serif" }}
      >
        {guest.lastName}, {guest.firstName}
      </h1>
      <div className="panel rounded-xl p-4 text-sm space-y-1">
        <div>Documento: {guest.documentType || "DNI"} {guest.documentNumber || "—"}</div>
        <div>Tel: {guest.phone || "—"}</div>
        <div>Email: {guest.email || "—"}</div>
        <div>Nacionalidad: {guest.nationality || "—"}</div>
        {guest.notes ? <div>Notas: {guest.notes}</div> : null}
      </div>
      <section className="panel rounded-xl p-4">
        <h2 className="mb-2 font-semibold">Reservas</h2>
        <ul className="space-y-1 text-sm">
          {guest.reservations.map((rg) => (
            <li key={rg.id}>
              <Link href={`/reservas/${rg.reservationId}`} className="text-[var(--brand)]">
                {rg.reservation.code}
              </Link>{" "}
              · {rg.role} · {RESERVATION_STATUS_LABEL[rg.reservation.status]}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
