import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateUi, toDateOnly } from "@/lib/dates";
import { checkInAction, checkOutAction } from "@/app/actions/stay";

export default async function OperacionPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const dateIso = sp.date || new Date().toISOString().slice(0, 10);
  const day = toDateOnly(dateIso);
  const dateLabel = formatDateUi(day);

  const [arrivals, departures, inHouse] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        checkInDate: day,
        status: { in: ["CONFIRMADA", "PRERRESERVA"] },
      },
      include: {
        guests: { where: { role: "TITULAR" }, include: { guest: true }, take: 1 },
        segments: { include: { physicalUnit: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.reservation.findMany({
      where: {
        checkOutDate: day,
        status: "IN_HOUSE",
      },
      include: {
        guests: { where: { role: "TITULAR" }, include: { guest: true }, take: 1 },
        segments: { include: { physicalUnit: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.reservation.findMany({
      where: { status: "IN_HOUSE" },
      include: {
        guests: { where: { role: "TITULAR" }, include: { guest: true }, take: 1 },
        segments: { include: { physicalUnit: true } },
      },
      orderBy: { code: "asc" },
    }),
  ]);

  return (
    <div className="space-y-5 fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            className="text-3xl text-[var(--brand-deep)]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            Operación
          </h1>
          <p className="text-sm text-[var(--muted)]">
            Llegadas / salidas / in-house · check-in y check-out.
          </p>
        </div>
        <form className="flex gap-2" action="/operacion" method="get">
          <input className="input" type="date" name="date" defaultValue={dateIso} />
          <button className="btn btn-ghost" type="submit">
            Ver fecha
          </button>
        </form>
      </div>

      <List
        title={`Llegadas ${dateLabel}`}
        items={arrivals}
        action={checkInAction}
        actionLabel="Check-in"
      />
      <List
        title={`Salidas ${dateLabel}`}
        items={departures}
        action={checkOutAction}
        actionLabel="Check-out"
      />
      <List title="In-house" items={inHouse} />
    </div>
  );
}

function List({
  title,
  items,
  action,
  actionLabel,
}: {
  title: string;
  items: {
    id: string;
    code: string;
    guests: { guest: { firstName: string; lastName: string } }[];
    segments: { physicalUnit: { code: string } }[];
  }[];
  action?: (formData: FormData) => Promise<void>;
  actionLabel?: string;
}) {
  return (
    <section className="panel rounded-xl p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Sin movimientos.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => {
            const g = r.guests[0]?.guest;
            const units = [...new Set(r.segments.map((s) => s.physicalUnit.code))].join(", ");
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] py-2 text-sm"
              >
                <div>
                  <Link href={`/reservas/${r.id}`} className="font-semibold text-[var(--brand)]">
                    {r.code}
                  </Link>{" "}
                  · {g ? `${g.lastName}, ${g.firstName}` : "Sin titular"} ·{" "}
                  {units || "sin habitación"}
                </div>
                {action && actionLabel ? (
                  <form action={action}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn btn-primary" type="submit">
                      {actionLabel}
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
