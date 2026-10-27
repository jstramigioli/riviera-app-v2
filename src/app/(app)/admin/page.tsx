import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getUsdBlueRate } from "@/lib/payments";
import { setBlueRateAction } from "@/app/actions/payments";
import { formatArs } from "@/lib/money";

export default async function AdminPage() {
  const user = await requireUser(["ADMIN"]);
  const blue = await getUsdBlueRate();
  const audits = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { user: true },
  });
  const counts = {
    units: await prisma.physicalUnit.count(),
    reservations: await prisma.reservation.count(),
    guests: await prisma.guest.count(),
    payments: await prisma.payment.count(),
  };

  return (
    <div className="space-y-5 fade-up">
      <div>
        <h1
          className="text-3xl text-[var(--brand-deep)]"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          Admin
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Permisos, auditoría, cotización blue, export y backups. Sesión: {user.email}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Habitaciones", counts.units],
          ["Reservas", counts.reservations],
          ["Huéspedes", counts.guests],
          ["Pagos", counts.payments],
        ].map(([label, n]) => (
          <div key={String(label)} className="panel rounded-xl p-4">
            <div className="text-xs uppercase text-[var(--muted)]">{label}</div>
            <div className="text-2xl font-semibold">{n}</div>
          </div>
        ))}
      </div>

      <form action={setBlueRateAction} className="panel flex flex-wrap items-end gap-3 rounded-xl p-4">
        <div>
          <label className="label">Cotización USD blue (manual)</label>
          <input className="input" name="rate" type="number" step="0.01" defaultValue={blue} />
        </div>
        <button className="btn btn-primary" type="submit">
          Guardar FX
        </button>
        <div className="text-sm text-[var(--muted)]">Actual: 1 USD = {formatArs(blue)}</div>
      </form>

      <section className="panel rounded-xl p-4 space-y-2">
        <h2 className="font-semibold">Export</h2>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-ghost" href="/api/export/reservations?format=csv">
            Reservas CSV
          </a>
          <a className="btn btn-ghost" href="/api/export/reservations?format=json">
            Reservas JSON
          </a>
          <a className="btn btn-ghost" href="/api/export/payments?format=csv">
            Pagos CSV
          </a>
          <a className="btn btn-ghost" href="/api/export/guests?format=csv">
            Huéspedes CSV
          </a>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Backup/restore: ver README y docs/backup-restore.md — usar `pg_dump` / `pg_restore`.
        </p>
      </section>

      <section className="panel overflow-auto rounded-xl">
        <h2 className="border-b border-[var(--line)] px-4 py-3 font-semibold">Audit log</h2>
        <table className="w-full min-w-[700px] text-sm">
          <thead className="text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 text-left">Cuando</th>
              <th className="px-3 py-2 text-left">Quién</th>
              <th className="px-3 py-2 text-left">Acción</th>
              <th className="px-3 py-2 text-left">Entidad</th>
            </tr>
          </thead>
          <tbody>
            {audits.map((a) => (
              <tr key={a.id} className="border-t border-[var(--line)]">
                <td className="px-3 py-2 whitespace-nowrap">
                  {a.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                </td>
                <td className="px-3 py-2">{a.user?.email || "—"}</td>
                <td className="px-3 py-2">{a.action}</td>
                <td className="px-3 py-2">
                  {a.entityType} {a.entityId ? `· ${a.entityId.slice(0, 8)}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
