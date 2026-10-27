import { prisma } from "@/lib/db";
import { createReservationAction } from "@/app/actions/reservations";

export default async function NuevaReservaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const units = await prisma.physicalUnit.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  const composites = await prisma.compositeUnit.findMany({
    where: { active: true },
    orderBy: { code: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 fade-up">
      <div>
        <h1
          className="text-3xl text-[var(--brand-deep)]"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          Nueva reserva
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Podés asignar una unidad, una compuesta (8+9 / 35+36) o un grupo.
        </p>
      </div>
      {sp.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
          {sp.error}
        </div>
      ) : null}
      <form action={createReservationAction} className="panel space-y-4 rounded-xl p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Check-in</label>
            <input className="input" type="date" name="checkInDate" required />
          </div>
          <div>
            <label className="label">Check-out</label>
            <input className="input" type="date" name="checkOutDate" required />
          </div>
          <div>
            <label className="label">Unidad física</label>
            <select className="select" name="physicalUnitId" defaultValue="">
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} · {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Unidad compuesta</label>
            <select className="select" name="compositeUnitId" defaultValue="">
              <option value="">—</option>
              {composites.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="select" name="status" defaultValue="PRERRESERVA">
              <option value="CONSULTA">Consulta</option>
              <option value="PRERRESERVA">Prerreserva</option>
              <option value="CONFIRMADA">Confirmada</option>
            </select>
          </div>
          <div>
            <label className="label">Canal</label>
            <input className="input" name="channel" placeholder="WhatsApp / Tel / Walk-in" />
          </div>
          <div>
            <label className="label">Servicio</label>
            <select className="select" name="serviceType" defaultValue="DESAYUNO">
              <option value="SIN_DESAYUNO">Sin desayuno</option>
              <option value="DESAYUNO">Desayuno</option>
              <option value="MEDIA_PENSION">Media pensión</option>
            </select>
          </div>
          <div>
            <label className="label">Precio acordado (ARS)</label>
            <input className="input" name="agreedPriceArs" type="number" min={0} step="1" />
          </div>
          <div>
            <label className="label">Adultos</label>
            <input className="input" name="adults" type="number" defaultValue={2} min={1} />
          </div>
          <div>
            <label className="label">Niños</label>
            <input className="input" name="children" type="number" defaultValue={0} min={0} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Unidades extra (grupo, IDs separados por coma)</label>
            <input className="input" name="extraUnitIds" placeholder="opcional" />
          </div>
          <div>
            <label className="label">Nombre de grupo</label>
            <input className="input" name="groupName" placeholder="Familia / Empresa" />
          </div>
        </div>

        <fieldset className="grid gap-4 rounded-lg border border-[var(--line)] p-3 sm:grid-cols-2">
          <legend className="px-1 text-xs font-semibold uppercase text-[var(--muted)]">
            Titular
          </legend>
          <div>
            <label className="label">Nombre</label>
            <input className="input" name="guestFirstName" />
          </div>
          <div>
            <label className="label">Apellido</label>
            <input className="input" name="guestLastName" />
          </div>
          <div>
            <label className="label">Documento</label>
            <input className="input" name="documentNumber" />
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input className="input" name="phone" />
          </div>
        </fieldset>

        <div>
          <label className="label">Requisitos</label>
          <textarea className="textarea" name="requirements" />
        </div>
        <div>
          <label className="label">Preferencias</label>
          <textarea className="textarea" name="preferences" />
        </div>
        <div>
          <label className="label">Notas</label>
          <textarea className="textarea" name="notes" />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="doNotMove" /> No mover
        </label>

        <button className="btn btn-primary" type="submit">
          Crear reserva
        </button>
      </form>
    </div>
  );
}
