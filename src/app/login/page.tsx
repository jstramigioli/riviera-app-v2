import { loginAction } from "@/app/actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel fade-up w-full max-w-md rounded-2xl p-8">
        <div className="mb-6">
          <div
            className="text-4xl text-[var(--brand-deep)]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            Riviera
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Ingresá para operar el calendario y las reservas.
          </p>
        </div>
        {sp.error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
            Credenciales inválidas
          </div>
        ) : null}
        <form action={loginAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              className="input"
              id="email"
              name="email"
              type="email"
              defaultValue="recepcion@riviera.local"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Contraseña
            </label>
            <input
              className="input"
              id="password"
              name="password"
              type="password"
              defaultValue="recepcion123"
              required
            />
          </div>
          <button className="btn btn-primary w-full" type="submit">
            Entrar
          </button>
        </form>
        <p className="mt-5 text-xs text-[var(--muted)]">
          Demo: admin@riviera.local / admin123 · recepcion@riviera.local / recepcion123
        </p>
      </div>
    </div>
  );
}
