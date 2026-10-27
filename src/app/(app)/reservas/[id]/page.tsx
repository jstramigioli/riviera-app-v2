import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  PAYMENT_STATUS_LABEL,
  RESERVATION_STATUS_LABEL,
} from "@/lib/status";
import { balanceArs, formatArs, netPaymentsArs } from "@/lib/money";
import { getUsdBlueRate } from "@/lib/payments";
import {
  addSegmentAction,
  setPriceAction,
  updateStatusAction,
} from "@/app/actions/reservations";
import { createPaymentAction, voidPaymentAction } from "@/app/actions/payments";
import { linkGuestAction } from "@/app/actions/guests";
import { requireUser } from "@/lib/auth";

export default async function ReservaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: {
      segments: {
        include: { physicalUnit: true, compositeUnit: true },
        orderBy: { sortOrder: "asc" },
      },
      guests: { include: { guest: true } },
      payments: { orderBy: { createdAt: "desc" } },
      group: true,
    },
  });
  if (!reservation) notFound();

  const units = await prisma.physicalUnit.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  const guests = await prisma.guest.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 200,
  });
  const blue = await getUsdBlueRate();
  const net = netPaymentsArs(reservation.payments);
  const bal = balanceArs(reservation.agreedPriceArs, reservation.payments);

  return (
    <div className="space-y-5 fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/calendario" className="text-xs text-[var(--muted)]">
            ← Calendario
          </Link>
          <h1
            className="text-3xl text-[var(--brand-deep)]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            {reservation.code}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {reservation.checkInDate.toISOString().slice(0, 10)} →{" "}
            {reservation.checkOutDate.toISOString().slice(0, 10)}
            {reservation.doNotMove ? " · 🔒 no mover" : ""}
            {reservation.group ? ` · Grupo: ${reservation.group.name}` : ""}
          </p>
        </div>
        <div className="panel rounded-xl px-4 py-3 text-sm">
          <div>
            Operativo: <strong>{RESERVATION_STATUS_LABEL[reservation.status]}</strong>
          </div>
          <div>
            Pago: <strong>{PAYMENT_STATUS_LABEL[reservation.paymentStatus]}</strong>
          </div>
          <div>
            Precio:{" "}
            <strong>
              {reservation.agreedPriceArs != null
                ? formatArs(reservation.agreedPriceArs)
                : "—"}
            </strong>
            {reservation.priceFrozen ? " (congelado)" : ""}
          </div>
          <div>
            Saldo: <strong>{formatArs(bal)}</strong>
          </div>
        </div>
      </div>

      {sp.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
          {sp.error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Estado operativo</h2>
          <form action={updateStatusAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={reservation.id} />
            <select className="select max-w-xs" name="status" defaultValue={reservation.status}>
              {Object.entries(RESERVATION_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" type="submit">
              Actualizar
            </button>
          </form>
          <p className="text-xs text-[var(--muted)]">
            Canal: {reservation.channel || "—"} · Servicio: {reservation.serviceType}
          </p>
          {reservation.requirements ? (
            <p className="text-sm">
              <strong>Requisitos:</strong> {reservation.requirements}
            </p>
          ) : null}
          {reservation.preferences ? (
            <p className="text-sm">
              <strong>Preferencias:</strong> {reservation.preferences}
            </p>
          ) : null}
        </section>

        <section className="panel rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Precio acordado</h2>
          <form action={setPriceAction} className="grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="id" value={reservation.id} />
            <div>
              <label className="label">Monto ARS</label>
              <input
                className="input"
                name="agreedPriceArs"
                type="number"
                defaultValue={
                  reservation.agreedPriceArs != null
                    ? Number(reservation.agreedPriceArs)
                    : undefined
                }
                required
              />
            </div>
            <div>
              <label className="label">Nota override</label>
              <input
                className="input"
                name="priceOverrideNote"
                defaultValue={reservation.priceOverrideNote ?? ""}
              />
            </div>
            <button className="btn btn-primary sm:col-span-2" type="submit">
              Guardar precio (auditado)
            </button>
          </form>
        </section>

        <section className="panel rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Tramos (AssignmentSegment)</h2>
          <ul className="space-y-1 text-sm">
            {reservation.segments.map((s) => (
              <li key={s.id}>
                <strong>{s.physicalUnit.code}</strong>
                {s.compositeUnit ? ` via ${s.compositeUnit.code}` : ""} ·{" "}
                {s.startDate.toISOString().slice(0, 10)} →{" "}
                {s.endDate.toISOString().slice(0, 10)}
              </li>
            ))}
          </ul>
          <form action={addSegmentAction} className="grid gap-2 sm:grid-cols-3">
            <input type="hidden" name="reservationId" value={reservation.id} />
            <select className="select" name="physicalUnitId" required>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code}
                </option>
              ))}
            </select>
            <input className="input" type="date" name="startDate" required />
            <input className="input" type="date" name="endDate" required />
            <button className="btn btn-ghost sm:col-span-3" type="submit">
              Agregar tramo (cambio mid-stay)
            </button>
          </form>
        </section>

        <section className="panel rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Huéspedes</h2>
          <ul className="space-y-1 text-sm">
            {reservation.guests.map((rg) => (
              <li key={rg.id}>
                <Link href={`/huespedes/${rg.guestId}`} className="text-[var(--brand)]">
                  {rg.guest.lastName}, {rg.guest.firstName}
                </Link>{" "}
                · {rg.role}
              </li>
            ))}
          </ul>
          <form action={linkGuestAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="reservationId" value={reservation.id} />
            <select className="select max-w-xs" name="guestId" required>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.lastName}, {g.firstName}
                </option>
              ))}
            </select>
            <select className="select max-w-[160px]" name="role" defaultValue="ACOMPANANTE">
              <option value="TITULAR">Titular</option>
              <option value="ACOMPANANTE">Acompañante</option>
            </select>
            <button className="btn btn-ghost" type="submit">
              Vincular
            </button>
          </form>
        </section>

        <section className="panel rounded-xl p-4 space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Pagos</h2>
            <div className="text-sm text-[var(--muted)]">
              Neto cobrado {formatArs(net)} · Blue ref. {blue}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="py-1 text-left">Recibo</th>
                <th className="py-1 text-left">Tipo</th>
                <th className="py-1 text-left">Original</th>
                <th className="py-1 text-left">ARS</th>
                <th className="py-1 text-left">Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reservation.payments.map((p) => (
                <tr key={p.id} className="border-t border-[var(--line)]">
                  <td className="py-1">
                    <Link href={`/recibos/${p.id}`} className="text-[var(--brand)]">
                      {p.receiptNumber}
                    </Link>
                  </td>
                  <td className="py-1">{p.type}</td>
                  <td className="py-1">
                    {p.currency} {Number(p.amountOriginal)}
                    {p.fxRateToArs ? ` @ ${Number(p.fxRateToArs)}` : ""}
                  </td>
                  <td className="py-1">{formatArs(p.amountArs)}</td>
                  <td className="py-1">{p.voidedAt ? "Anulado" : "Vigente"}</td>
                  <td className="py-1 text-right">
                    {!p.voidedAt && user.role === "ADMIN" ? (
                      <form action={voidPaymentAction} className="inline">
                        <input type="hidden" name="paymentId" value={p.id} />
                        <input type="hidden" name="reservationId" value={reservation.id} />
                        <input type="hidden" name="reason" value="Anulación manual" />
                        <button className="text-xs text-[var(--danger)]" type="submit">
                          Anular
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <form
            action={createPaymentAction}
            className="grid gap-2 rounded-lg border border-[var(--line)] p-3 sm:grid-cols-5"
          >
            <input type="hidden" name="reservationId" value={reservation.id} />
            <select className="select" name="type" defaultValue="SENIA">
              <option value="SENIA">Seña</option>
              <option value="PARCIAL">Parcial</option>
              <option value="FINAL">Final</option>
              <option value="DEVOLUCION">Devolución</option>
            </select>
            <select className="select" name="currency" defaultValue="ARS">
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
            <input
              className="input"
              name="amountOriginal"
              type="number"
              step="0.01"
              placeholder="Importe"
              required
            />
            <input
              className="input"
              name="fxRateToArs"
              type="number"
              step="0.01"
              placeholder={`FX blue (${blue})`}
              defaultValue={blue}
            />
            <button className="btn btn-primary" type="submit">
              Registrar pago
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
