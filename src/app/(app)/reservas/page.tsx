import Link from "next/link";
import { prisma } from "@/lib/db";
import { RESERVATION_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/status";
import { formatArs } from "@/lib/money";
import { formatDateUi } from "@/lib/dates";

export default async function ReservasPage() {
  const reservations = await prisma.reservation.findMany({
    where: { status: { not: "CONSULTA" } },
    orderBy: { checkInDate: "desc" },
    take: 100,
    include: {
      guests: { where: { role: "TITULAR" }, include: { guest: true }, take: 1 },
      segments: { include: { physicalUnit: true }, orderBy: { sortOrder: "asc" } },
    },
  });

  return (
    <div className="space-y-4 fade-up">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1
            className="text-3xl text-[var(--brand-deep)]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            Reservas
          </h1>
          <p className="text-sm text-[var(--muted)]">
            Estado operativo ≠ estado de pago. Las consultas van en{" "}
            <Link className="text-[var(--brand)]" href="/consultas">
              Consultas
            </Link>
            .
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="btn btn-ghost" href="/consultas/nueva">
            Nueva consulta
          </Link>
          <Link className="btn btn-primary" href="/reservas/nueva">
            Nueva reserva
          </Link>
        </div>
      </div>
      <div className="panel overflow-auto rounded-xl">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-[var(--line)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Huésped</th>
              <th className="px-3 py-2">In–Out</th>
              <th className="px-3 py-2">Habitación</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Pago</th>
              <th className="px-3 py-2">Precio</th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((r) => {
              const g = r.guests[0]?.guest;
              return (
                <tr key={r.id} className="border-b border-[var(--line)] hover:bg-white/50">
                  <td className="px-3 py-2">
                    <Link className="font-semibold text-[var(--brand)]" href={`/reservas/${r.id}`}>
                      {r.code}
                    </Link>
                    {r.doNotMove ? (
                      <span className="ml-2 text-xs text-[var(--accent)]">fijada</span>
                    ) : (
                      <span className="ml-2 text-xs text-[var(--muted)]">flexible</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {g ? `${g.lastName}, ${g.firstName}` : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDateUi(r.checkInDate)} → {formatDateUi(r.checkOutDate)}
                  </td>
                  <td className="px-3 py-2">
                    {[...new Set(r.segments.map((s) => s.physicalUnit.code))].join(", ")}
                  </td>
                  <td className="px-3 py-2">{RESERVATION_STATUS_LABEL[r.status]}</td>
                  <td className="px-3 py-2">{PAYMENT_STATUS_LABEL[r.paymentStatus]}</td>
                  <td className="px-3 py-2">
                    {r.agreedPriceArs != null ? formatArs(r.agreedPriceArs) : "—"}
                    {r.priceFrozen ? (
                      <span className="ml-1 text-[10px] text-[var(--muted)]">frozen</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
