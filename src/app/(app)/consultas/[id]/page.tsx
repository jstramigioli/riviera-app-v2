import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ConsultaForm } from "@/components/ConsultaForm";
import { QUERY_STATUS_LABEL } from "@/lib/labels";
import { deleteQueryAction } from "@/app/actions/queries";

export default async function ConsultaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const query = await prisma.query.findUnique({
    where: { id },
    include: {
      structuredReqs: true,
      convertedReservation: { select: { id: true, code: true } },
    },
  });
  if (!query) notFound();

  const attributes = await prisma.unitAttribute.findMany({
    orderBy: { label: "asc" },
    select: { id: true, key: true, label: true },
  });

  if (query.status !== "OPEN") {
    return (
      <div className="space-y-4 fade-up max-w-2xl">
        <Link href="/consultas" className="text-xs text-[var(--muted)]">
          ← Consultas
        </Link>
        <h1
          className="text-3xl text-[var(--brand-deep)]"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          {query.code}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Estado: {QUERY_STATUS_LABEL[query.status] ?? query.status}
        </p>
        {query.convertedReservation ? (
          <p>
            Convertida a{" "}
            <Link
              className="text-[var(--brand)] font-semibold"
              href={`/reservas/${query.convertedReservation.id}`}
            >
              {query.convertedReservation.code}
            </Link>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 fade-up max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/consultas" className="text-xs text-[var(--muted)]">
            ← Consultas
          </Link>
          <h1
            className="text-3xl text-[var(--brand-deep)]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            {query.code}
          </h1>
          <p className="text-sm text-[var(--muted)]">Consulta abierta · sin habitación</p>
        </div>
        <form action={deleteQueryAction}>
          <input type="hidden" name="id" value={query.id} />
          <button className="btn btn-ghost text-[var(--danger)]" type="submit">
            Eliminar
          </button>
        </form>
      </div>
      <ConsultaForm
        attributes={attributes}
        error={sp.error}
        initial={{
          id: query.id,
          code: query.code,
          checkInDate: query.checkInDate.toISOString().slice(0, 10),
          checkOutDate: query.checkOutDate.toISOString().slice(0, 10),
          adults: query.adults,
          children: query.children,
          serviceType: query.serviceType,
          channel: query.channel,
          notes: query.notes,
          guestFirstName: query.guestFirstName,
          guestLastName: query.guestLastName,
          guestPhone: query.guestPhone,
          guestEmail: query.guestEmail,
          guestDocumentNumber: query.guestDocumentNumber,
          mandatoryIds: query.structuredReqs
            .filter((r) => r.kind === "MANDATORY")
            .map((r) => r.attributeId),
          preferenceIds: query.structuredReqs
            .filter((r) => r.kind === "PREFERENCE")
            .map((r) => r.attributeId),
        }}
      />
    </div>
  );
}
