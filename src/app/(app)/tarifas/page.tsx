import { prisma } from "@/lib/db";
import { formatArs } from "@/lib/money";
import { createRatePlanAction, createRateAction } from "@/app/actions/rates";

export default async function TarifasPage() {
  const plans = await prisma.ratePlan.findMany({
    include: {
      commercialCategory: true,
      rates: { orderBy: { validFrom: "desc" }, take: 3 },
    },
    orderBy: { name: "asc" },
  });
  const categories = await prisma.commercialCategory.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="space-y-5 fade-up">
      <div>
        <h1
          className="text-3xl text-[var(--brand-deep)]"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          Tarifas
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Planes por categoría, servicio (desayuno / media pensión / sin desayuno) y período. El precio
          acordado se congela al confirmar.
        </p>
      </div>

      <section className="panel overflow-auto rounded-xl">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-[var(--line)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 text-left">Plan</th>
              <th className="px-3 py-2 text-left">Categoría</th>
              <th className="px-3 py-2 text-left">Servicio</th>
              <th className="px-3 py-2 text-left">Última tarifa</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => {
              const r = p.rates[0];
              return (
                <tr key={p.id} className="border-b border-[var(--line)]">
                  <td className="px-3 py-2 font-semibold">{p.name}</td>
                  <td className="px-3 py-2">{p.commercialCategory.name}</td>
                  <td className="px-3 py-2">{p.serviceType}</td>
                  <td className="px-3 py-2">
                    {r
                      ? `${formatArs(r.amountArs)} (${r.validFrom.toISOString().slice(0, 10)}→${r.validTo.toISOString().slice(0, 10)})`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <form action={createRatePlanAction} className="panel space-y-3 rounded-xl p-4">
          <h2 className="font-semibold">Nuevo plan tarifario</h2>
          <input className="input" name="name" placeholder="Nombre" required />
          <select className="select" name="commercialCategoryId" required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
          <select className="select" name="serviceType" defaultValue="DESAYUNO">
            <option value="SIN_DESAYUNO">Sin desayuno</option>
            <option value="DESAYUNO">Desayuno</option>
            <option value="MEDIA_PENSION">Media pensión</option>
          </select>
          <button className="btn btn-primary" type="submit">
            Crear plan
          </button>
        </form>

        <form action={createRateAction} className="panel space-y-3 rounded-xl p-4">
          <h2 className="font-semibold">Nueva Rate (período)</h2>
          <select className="select" name="ratePlanId" required>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input className="input" type="date" name="validFrom" required />
          <input className="input" type="date" name="validTo" required />
          <input className="input" type="number" name="amountArs" placeholder="Monto ARS" required />
          <button className="btn btn-primary" type="submit">
            Crear tarifa
          </button>
        </form>
      </div>
    </div>
  );
}
