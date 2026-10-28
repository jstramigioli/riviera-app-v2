import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  PAYMENT_STATUS_LABEL,
  RESERVATION_STATUS_LABEL,
} from "@/lib/status";
import {
  SERVICE_TYPE_LABEL,
  communicatingRoomsLabel,
} from "@/lib/labels";
import { balanceArs, formatArs, netPaymentsArs } from "@/lib/money";
import { getUsdBlueRate } from "@/lib/payments";
import {
  addSegmentAction,
  setPriceAction,
  updateStatusAction,
} from "@/app/actions/reservations";
import { setRoomLockedAction } from "@/app/actions/assignment";
import { createPaymentAction, voidPaymentAction } from "@/app/actions/payments";
import { linkGuestAction } from "@/app/actions/guests";
import { requireUser } from "@/lib/auth";
import { FieldLabel, HelpTooltip } from "@/components/HelpTooltip";
import { formatDateUi } from "@/lib/dates";

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
      structuredReqs: { include: { attribute: true } },
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
          <Link href="/calendario" className="text-link-back text-xs">
            ← Calendario
          </Link>
          <h1
            className="text-3xl text-[var(--brand-deep)]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            {reservation.code}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {formatDateUi(reservation.checkInDate)} →{" "}
            {formatDateUi(reservation.checkOutDate)}
            {" · "}
            {reservation.adults + reservation.children} persona
            {reservation.adults + reservation.children === 1 ? "" : "s"}
            {reservation.children > 0
              ? ` (${reservation.adults} + ${reservation.children} niño${reservation.children === 1 ? "" : "s"})`
              : ""}
            {reservation.doNotMove ? " · 🔒 habitación fijada" : " · asignación flexible"}
            {reservation.group ? ` · Grupo: ${reservation.group.name}` : ""}
          </p>
        </div>
        <div className="panel rounded-xl px-4 py-3 text-sm">
          <div>
            Estado: <strong>{RESERVATION_STATUS_LABEL[reservation.status]}</strong>
          </div>
          <div>
            Pago: <strong>{PAYMENT_STATUS_LABEL[reservation.paymentStatus]}</strong>{" "}
            <HelpTooltip text="El estado de pago es independiente: una seña no confirma sola la reserva." />
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

          <div
        className={`rounded-lg border px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-2 ${
          reservation.doNotMove
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : "border-[var(--line)] bg-white/60 text-[var(--muted)]"
        }`}
      >
        <span>
          {reservation.doNotMove
            ? "Habitación fijada: el optimizador no la mueve; cambiá solo con decisión consciente."
            : "Asignación flexible: se puede reasignar entre habitaciones compatibles (u optimizador)."}
          <HelpTooltip text="Fijada = inamovible salvo desbloqueo. Flexible = el sistema puede proponer otra habitación que cumpla lo pedido." />
        </span>
        <form action={setRoomLockedAction} className="inline">
          <input type="hidden" name="id" value={reservation.id} />
          <input
            type="hidden"
            name="roomLocked"
            value={reservation.doNotMove ? "false" : "true"}
          />
          <button className="btn btn-ghost" type="submit">
            {reservation.doNotMove ? "Desfijar (hacer flexible)" : "Fijar habitación"}
          </button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Estado de la reserva</h2>
          <form action={updateStatusAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={reservation.id} />
            <select className="select max-w-xs" name="status" defaultValue={reservation.status}>
              {Object.entries(RESERVATION_STATUS_LABEL)
                .filter(([k]) => k !== "CONSULTA" || reservation.status === "CONSULTA")
                .map(([k, v]) => (
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
            Canal: {reservation.channel || "—"} · Servicio:{" "}
            {SERVICE_TYPE_LABEL[reservation.serviceType]}
          </p>
          {reservation.structuredReqs.length ? (
            <div className="text-sm space-y-1">
              <div className="font-semibold inline-flex items-center gap-1">
                Características deseadas
                <HelpTooltip text="Sugieren habitaciones; recepción puede asignar otra con advertencia." />
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {reservation.structuredReqs.map((r) => (
                  <li key={r.id} className="tag-chip tag-chip-desired">
                    {r.attribute.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {reservation.notes ? (
            <p className="text-sm">
              <strong>Notas:</strong> {reservation.notes}
            </p>
          ) : null}
          {(reservation.requirements || reservation.preferences) &&
          !reservation.structuredReqs.length ? (
            <p className="text-sm text-[var(--muted)]">
              {reservation.requirements ? `Requisitos (legado): ${reservation.requirements}. ` : ""}
              {reservation.preferences ? `Preferencias (legado): ${reservation.preferences}` : ""}
            </p>
          ) : null}
        </section>

        <section className="panel rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Precio acordado</h2>
          <form action={setPriceAction} className="grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="id" value={reservation.id} />
            <div>
              <FieldLabel>Monto ARS</FieldLabel>
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
              <FieldLabel help="Obligatorio si cambiás un precio ya congelado.">
                Nota del cambio
              </FieldLabel>
              <input
                className="input"
                name="priceOverrideNote"
                defaultValue={reservation.priceOverrideNote ?? ""}
              />
            </div>
            <button className="btn btn-primary sm:col-span-2" type="submit">
              Guardar precio
            </button>
          </form>
        </section>

        <section className="panel rounded-xl p-4 space-y-3">
          <h2 className="font-semibold inline-flex items-center gap-1.5">
            Tramos de estadía
            <HelpTooltip text="Si el huésped cambia de habitación a mitad de estadía, la misma reserva se parte en varios tramos contiguos (sin noches huérfanas)." />
          </h2>
          <ul className="space-y-1 text-sm">
            {reservation.segments.map((s) => (
              <li key={s.id}>
                <strong>
                  {s.physicalUnit.kind === "DEPARTAMENTO"
                    ? s.physicalUnit.name
                    : `Habitación ${s.physicalUnit.code}`}
                </strong>
                {s.compositeUnit
                  ? ` · ${communicatingRoomsLabel(s.compositeUnit.code, s.compositeUnit.name)}`
                  : ""}{" "}
                · {formatDateUi(s.startDate)} → {formatDateUi(s.endDate)}
              </li>
            ))}
          </ul>
          <form action={addSegmentAction} className="grid gap-2 sm:grid-cols-3">
            <input type="hidden" name="reservationId" value={reservation.id} />
            <div className="sm:col-span-3">
              <FieldLabel help="Solo habitaciones del inventario. La disponibilidad se valida al guardar.">
                Cambio de habitación (nuevo tramo)
              </FieldLabel>
            </div>
            <select className="select" name="physicalUnitId" required>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} · {u.name}
                </option>
              ))}
            </select>
            <input className="input" type="date" name="startDate" required />
            <input className="input" type="date" name="endDate" required />
            <button className="btn btn-ghost sm:col-span-3" type="submit">
              Agregar tramo
            </button>
          </form>
        </section>

        <section className="panel rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">
            Huéspedes{" "}
            <span className="font-normal text-[var(--muted)]">
              ({reservation.guests.length}/{reservation.adults + reservation.children})
            </span>
          </h2>
          <ul className="space-y-1 text-sm">
            {reservation.guests.map((rg) => (
              <li key={rg.id}>
                <Link href={`/huespedes/${rg.guestId}`} className="text-link font-semibold">
                  {rg.guest.lastName}, {rg.guest.firstName}
                </Link>{" "}
                · {rg.role === "TITULAR" ? "Titular" : "Acompañante"}
                {rg.role === "TITULAR" && (rg.guest.phone || rg.guest.email) ? (
                  <span className="text-[var(--muted)]">
                    {" "}
                    · {[rg.guest.phone, rg.guest.email].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
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
            <h2 className="font-semibold inline-flex items-center gap-1.5">
              Pagos
              <HelpTooltip text="Registrar una seña actualiza el estado de pago, no el estado operativo de la reserva." />
            </h2>
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
                    <Link href={`/recibos/${p.id}`} className="text-link">
                      {p.receiptNumber}
                    </Link>
                  </td>
                  <td className="py-1">
                    {p.type === "SENIA"
                      ? "Seña"
                      : p.type === "PARCIAL"
                        ? "Parcial"
                        : p.type === "FINAL"
                          ? "Final"
                          : "Devolución"}
                  </td>
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
              placeholder={`Cotización blue (${blue})`}
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
