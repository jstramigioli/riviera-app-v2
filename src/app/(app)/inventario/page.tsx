import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { upsertUnitAction, upsertCategoryAction, upsertAttributeAction } from "@/app/actions/inventory";

export default async function InventarioPage() {
  await requireUser(["ADMIN", "RECEPCION"]);
  const units = await prisma.physicalUnit.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      commercialCategory: true,
      attributes: { include: { attribute: true } },
      compositeMemberships: { include: { composite: true } },
    },
  });
  const categories = await prisma.commercialCategory.findMany({ orderBy: { sortOrder: "asc" } });
  const attributes = await prisma.unitAttribute.findMany({ orderBy: { label: "asc" } });
  const composites = await prisma.compositeUnit.findMany({
    include: { members: { include: { unit: true } } },
    orderBy: { code: "asc" },
  });

  return (
    <div className="space-y-5 fade-up">
      <div>
        <h1
          className="text-3xl text-[var(--brand-deep)]"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          Inventario
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Unidades físicas, atributos, categorías y compuestas (8+9, 35+36).
        </p>
      </div>

      <section className="panel rounded-xl p-4">
        <h2 className="mb-3 font-semibold">Unidades compuestas</h2>
        <ul className="space-y-1 text-sm">
          {composites.map((c) => (
            <li key={c.id}>
              <strong>{c.code}</strong> — {c.name}:{" "}
              {c.members.map((m) => m.unit.code).join(" + ")}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Categorías comerciales</h2>
          <ul className="text-sm space-y-1">
            {categories.map((c) => (
              <li key={c.id}>
                {c.code} · {c.name}
              </li>
            ))}
          </ul>
          <form action={upsertCategoryAction} className="grid gap-2 sm:grid-cols-2">
            <input className="input" name="code" placeholder="Código" required />
            <input className="input" name="name" placeholder="Nombre" required />
            <button className="btn btn-ghost sm:col-span-2" type="submit">
              Alta / update categoría
            </button>
          </form>
        </section>

        <section className="panel rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Atributos</h2>
          <ul className="text-sm space-y-1">
            {attributes.map((a) => (
              <li key={a.id}>
                {a.key} · {a.label}
              </li>
            ))}
          </ul>
          <form action={upsertAttributeAction} className="grid gap-2 sm:grid-cols-2">
            <input className="input" name="key" placeholder="key" required />
            <input className="input" name="label" placeholder="Etiqueta" required />
            <button className="btn btn-ghost sm:col-span-2" type="submit">
              Alta / update atributo
            </button>
          </form>
        </section>
      </div>

      <section className="panel overflow-auto rounded-xl">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="border-b border-[var(--line)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 text-left">Código</th>
              <th className="px-3 py-2 text-left">Nombre</th>
              <th className="px-3 py-2 text-left">Cap.</th>
              <th className="px-3 py-2 text-left">Categoría</th>
              <th className="px-3 py-2 text-left">Atributos</th>
              <th className="px-3 py-2 text-left">Compuestas</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id} className="border-b border-[var(--line)]">
                <td className="px-3 py-2 font-semibold">{u.code}</td>
                <td className="px-3 py-2">{u.name}</td>
                <td className="px-3 py-2">{u.capacity}</td>
                <td className="px-3 py-2">{u.commercialCategory?.name ?? "—"}</td>
                <td className="px-3 py-2">
                  {u.attributes.map((a) => a.attribute.label).join(", ") || "—"}
                </td>
                <td className="px-3 py-2">
                  {u.compositeMemberships.map((m) => m.composite.code).join(", ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">Editar / alta unidad</h2>
        <form action={upsertUnitAction} className="grid gap-2 sm:grid-cols-3">
          <input className="input" name="code" placeholder="Código" required />
          <input className="input" name="name" placeholder="Nombre" required />
          <input className="input" name="capacity" type="number" placeholder="Capacidad" defaultValue={2} />
          <select className="select" name="kind" defaultValue="HABITACION">
            <option value="HABITACION">Habitación</option>
            <option value="DEPARTAMENTO">Departamento</option>
          </select>
          <select className="select" name="commercialCategoryId" defaultValue="">
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>
          <input className="input" name="sortOrder" type="number" placeholder="Orden" defaultValue={0} />
          <button className="btn btn-primary sm:col-span-3" type="submit">
            Guardar unidad
          </button>
        </form>
      </section>
    </div>
  );
}
