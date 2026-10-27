import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";

const NAV = [
  { href: "/calendario", label: "Calendario" },
  { href: "/reservas", label: "Reservas" },
  { href: "/huespedes", label: "Huéspedes" },
  { href: "/operacion", label: "Operación" },
  { href: "/tarifas", label: "Tarifas" },
  { href: "/inventario", label: "Inventario" },
  { href: "/admin", label: "Admin" },
];

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[rgba(243,239,230,0.9)] backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-4 py-3">
          <Link href="/calendario" className="shrink-0">
            <div
              className="text-xl tracking-tight text-[var(--brand-deep)]"
              style={{ fontFamily: "var(--font-display), serif" }}
            >
              Riviera
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
              PMS · Mar del Plata
            </div>
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2.5 py-1.5 text-sm text-[var(--muted)] hover:bg-white/70 hover:text-[var(--ink)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-right leading-tight">
              <div className="font-semibold">{user.name}</div>
              <div className="text-xs text-[var(--muted)]">{user.role}</div>
            </div>
            <form action={logoutAction}>
              <button className="btn btn-ghost" type="submit">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-5">{children}</main>
    </div>
  );
}
