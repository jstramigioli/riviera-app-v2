import Link from "next/link";
import { prisma } from "@/lib/db";
import { createGuestAction } from "@/app/actions/guests";

export default async function HuespedesPage() {
  const guests = await prisma.guest.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 200,
  });

  return (
    <div className="space-y-5 fade-up">
      <div>
        <h1
          className="text-3xl text-[var(--brand-deep)]"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          Huéspedes
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Fichas independientes. Campos legales mínimos (ampliar con Julián).
        </p>
      </div>

      <form action={createGuestAction} className="panel grid gap-2 rounded-xl p-4 sm:grid-cols-3">
        <input className="input" name="firstName" placeholder="Nombre" required />
        <input className="input" name="lastName" placeholder="Apellido" required />
        <input className="input" name="documentNumber" placeholder="Documento" />
        <input className="input" name="phone" placeholder="Teléfono" />
        <input className="input" name="email" placeholder="Email" />
        <input className="input" name="nationality" placeholder="Nacionalidad" />
        <button className="btn btn-primary sm:col-span-3" type="submit">
          Crear huésped
        </button>
      </form>

      <div className="panel overflow-auto rounded-xl">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="border-b border-[var(--line)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 text-left">Nombre</th>
              <th className="px-3 py-2 text-left">Documento</th>
              <th className="px-3 py-2 text-left">Contacto</th>
            </tr>
          </thead>
          <tbody>
            {guests.map((g) => (
              <tr key={g.id} className="border-b border-[var(--line)]">
                <td className="px-3 py-2">
                  <Link className="font-semibold text-[var(--brand)]" href={`/huespedes/${g.id}`}>
                    {g.lastName}, {g.firstName}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  {g.documentType || "DNI"} {g.documentNumber || "—"}
                </td>
                <td className="px-3 py-2">
                  {g.phone || g.email || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
