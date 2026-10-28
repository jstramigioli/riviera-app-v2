import Link from "next/link";
import { OptimizerPanel } from "@/components/OptimizerPanel";
import { HelpTooltip } from "@/components/HelpTooltip";

export default function OptimizadorPage() {
  return (
    <div className="space-y-4 fade-up max-w-4xl">
      <div>
        <Link href="/calendario" className="text-link-back text-xs">
          ← Calendario
        </Link>
        <h1
          className="text-3xl text-[var(--brand-deep)]"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          Optimizar ocupación
        </h1>
        <p className="text-sm text-[var(--muted)] inline-flex flex-wrap items-center gap-1">
          Solo a pedido · preview obligatorio · no mueve fijadas ni en casa.
          <HelpTooltip text="Sirve para juntar estadías flexibles y reducir huecos libres entre reservas. Nunca corre solo." />
        </p>
      </div>
      <OptimizerPanel />
    </div>
  );
}
