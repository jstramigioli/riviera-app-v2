import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatArs } from "@/lib/money";
import { formatDateUi } from "@/lib/dates";

export default async function ReciboPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      reservation: {
        include: {
          guests: { where: { role: "TITULAR" }, include: { guest: true }, take: 1 },
        },
      },
      createdBy: true,
    },
  });
  if (!payment) notFound();
  const titular = payment.reservation.guests[0]?.guest;

  return (
    <div className="mx-auto max-w-xl space-y-4 fade-up">
      <Link href={`/reservas/${payment.reservationId}`} className="text-xs text-[var(--muted)]">
        ← Reserva
      </Link>
      <div className="panel rounded-xl p-6 print:shadow-none">
        <div
          className="text-2xl text-[var(--brand-deep)]"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          Hotel Riviera
        </div>
        <div className="text-sm text-[var(--muted)]">Recibo interno (no fiscal)</div>
        <hr className="my-4 border-[var(--line)]" />
        <div className="space-y-1 text-sm">
          <div>
            <strong>Nº</strong> {payment.receiptNumber}
          </div>
          <div>
            <strong>Fecha</strong> {formatDateUi(payment.createdAt)}
          </div>
          <div>
            <strong>Reserva</strong> {payment.reservation.code}
          </div>
          <div>
            <strong>Huésped</strong>{" "}
            {titular ? `${titular.lastName}, ${titular.firstName}` : "—"}
          </div>
          <div>
            <strong>Tipo</strong> {payment.type}
          </div>
          <div>
            <strong>Importe</strong> {payment.currency} {Number(payment.amountOriginal)}
            {payment.fxRateToArs
              ? ` · FX ${Number(payment.fxRateToArs)} → ${formatArs(payment.amountArs)}`
              : ` · ${formatArs(payment.amountArs)}`}
          </div>
          {payment.voidedAt ? (
            <div className="text-[var(--danger)]">
              ANULADO {formatDateUi(payment.voidedAt)} — {payment.voidReason}
            </div>
          ) : null}
          {payment.notes ? <div>Notas: {payment.notes}</div> : null}
          <div className="pt-2 text-xs text-[var(--muted)]">
            Registrado por {payment.createdBy?.name || "sistema"}
          </div>
        </div>
        <p className="mt-6 text-xs text-[var(--muted)] print:hidden">
          Usá Ctrl/Cmd+P para imprimir este recibo.
        </p>
      </div>
    </div>
  );
}
