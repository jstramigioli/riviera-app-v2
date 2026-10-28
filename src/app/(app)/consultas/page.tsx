import Link from "next/link";
import { prisma } from "@/lib/db";
import { QUERY_STATUS_LABEL, SERVICE_TYPE_LABEL } from "@/lib/labels";
import { formatDateUi } from "@/lib/dates";
import { HelpTooltip } from "@/components/HelpTooltip";
import { deleteQueryAction } from "@/app/actions/queries";

export default async function ConsultasPage() {
  const queries = await prisma.query.findMany({
    where: { status: { in: ["OPEN", "CONVERTED"] } },
    orderBy: [{ status: "asc" }, { checkInDate: "asc" }, { updatedAt: "desc" }],
    take: 150,
    include: {
      structuredReqs: { include: { attribute: true } },
      convertedReservation: { select: { id: true, code: true } },
    },
  });

  const open = queries.filter((q) => q.status === "OPEN");
  const converted = queries.filter((q) => q.status === "CONVERTED");

  return (
    <div className="space-y-4 fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            className="text-3xl text-[var(--brand-deep)]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            Consultas
          </h1>
          <p className="text-sm text-[var(--muted)] inline-flex flex-wrap items-center gap-1">
            Indagaciones sin habitación · no aparecen en el calendario.
            <HelpTooltip text="Guardá cliente y fechas; explorá disponibilidad; al confirmar interés convertí a prerreserva eligiendo habitación." />
          </p>
        </div>
        <Link className="btn btn-primary" href="/consultas/nueva">
          Nueva consulta
        </Link>
      </div>

      <QueryTable title={`Abiertas (${open.length})`} rows={open} canDelete />
      {converted.length > 0 ? (
        <QueryTable title={`Convertidas recientes (${converted.length})`} rows={converted} />
      ) : null}
    </div>
  );
}

function QueryTable({
  title,
  rows,
  canDelete,
}: {
  title: string;
  rows: {
    id: string;
    code: string;
    status: string;
    guestFirstName: string | null;
    guestLastName: string | null;
    checkInDate: Date;
    checkOutDate: Date;
    serviceType: keyof typeof SERVICE_TYPE_LABEL;
    channel: string | null;
    structuredReqs: { kind: string; attribute: { label: string } }[];
    convertedReservation: { id: string; code: string } | null;
  }[];
  canDelete?: boolean;
}) {
  return (
    <section className="panel overflow-auto rounded-xl">
      <div className="border-b border-[var(--line)] px-3 py-2 text-sm font-semibold">
        {title}
      </div>
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-[var(--line)] text-xs uppercase text-[var(--muted)]">
          <tr>
            <th className="px-3 py-2">Código</th>
            <th className="px-3 py-2">Cliente</th>
            <th className="px-3 py-2">Fechas</th>
            <th className="px-3 py-2">Pide</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-[var(--muted)]">
                No hay consultas acá.{" "}
                <Link className="text-[var(--brand)]" href="/consultas/nueva">
                  Crear una
                </Link>
              </td>
            </tr>
          ) : (
            rows.map((q) => {
              const name =
                q.guestLastName || q.guestFirstName
                  ? `${q.guestLastName || ""}${q.guestLastName && q.guestFirstName ? ", " : ""}${q.guestFirstName || ""}`
                  : "—";
              return (
                <tr key={q.id} className="border-b border-[var(--line)] hover:bg-white/50">
                  <td className="px-3 py-2">
                    <Link
                      className="font-semibold text-[var(--brand)]"
                      href={`/consultas/${q.id}`}
                    >
                      {q.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {name}
                    {q.channel ? (
                      <div className="text-xs text-[var(--muted)]">{q.channel}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDateUi(q.checkInDate)} → {formatDateUi(q.checkOutDate)}
                    <div className="text-xs text-[var(--muted)]">
                      {SERVICE_TYPE_LABEL[q.serviceType]}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {q.structuredReqs.length
                      ? q.structuredReqs.map((r) => r.attribute.label).join(", ")
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {QUERY_STATUS_LABEL[q.status] ?? q.status}
                    {q.convertedReservation ? (
                      <div className="text-xs">
                        <Link
                          className="text-[var(--brand)]"
                          href={`/reservas/${q.convertedReservation.id}`}
                        >
                          {q.convertedReservation.code}
                        </Link>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Link className="btn btn-ghost" href={`/consultas/${q.id}`}>
                      Abrir
                    </Link>
                    {canDelete && q.status === "OPEN" ? (
                      <form action={deleteQueryAction} className="inline ml-1">
                        <input type="hidden" name="id" value={q.id} />
                        <button className="btn btn-ghost text-[var(--danger)]" type="submit">
                          Eliminar
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}
