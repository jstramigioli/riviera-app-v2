import Link from "next/link";
import { prisma } from "@/lib/db";
import { ConsultaForm } from "@/components/ConsultaForm";
import { HelpTooltip } from "@/components/HelpTooltip";

export default async function NuevaConsultaPage() {
  const attributes = await prisma.unitAttribute.findMany({
    orderBy: { label: "asc" },
    select: { id: true, key: true, label: true },
  });

  return (
    <div className="space-y-4 fade-up max-w-4xl">
      <div>
        <Link href="/consultas" className="text-xs text-[var(--muted)]">
          ← Consultas
        </Link>
        <h1
          className="text-3xl text-[var(--brand-deep)]"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          Nueva consulta
        </h1>
        <p className="text-sm text-[var(--muted)] inline-flex items-center gap-1">
          Sin habitación · no bloquea inventario · no aparece en el calendario.
          <HelpTooltip text="Se guarda solo con fechas. Cuando el cliente confirma, convertí eligiendo habitación." />
        </p>
      </div>
      <ConsultaForm attributes={attributes} />
    </div>
  );
}
