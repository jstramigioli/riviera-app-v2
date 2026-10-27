import Link from "next/link";
import { RESERVATION_STATUS_LABEL, RESERVATION_STATUS_COLOR } from "@/lib/status";
import { HelpTooltip } from "@/components/HelpTooltip";
import type { CalendarBlock } from "@/lib/calendar";

type UnitRow = {
  id: string;
  code: string;
  name: string;
  category: string;
  composites: string[];
  blocks: CalendarBlock[];
};

export function CalendarView({
  days,
  units,
  startIso,
  dayCount,
}: {
  days: { iso: string; label: string; weekday: string }[];
  units: UnitRow[];
  startIso: string;
  dayCount: number;
}) {
  const prev = shiftIso(startIso, -dayCount);
  const next = shiftIso(startIso, dayCount);
  const cell = 42;

  return (
    <div className="space-y-4 fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            className="text-3xl text-[var(--brand-deep)]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            Calendario
          </h1>
          <p className="text-sm text-[var(--muted)] inline-flex flex-wrap items-center gap-1">
            Habitaciones por fila · días por columna. Tocá un día libre para crear reserva.
            <HelpTooltip text="La fecha de salida no ocupa noche (checkout exclusivo). Las consultas no aparecen acá: van en la sección Consultas, sin habitación." />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link className="btn btn-ghost" href={`/calendario?start=${prev}&days=${dayCount}`}>
            ← Período
          </Link>
          <Link className="btn btn-ghost" href={`/calendario?days=${dayCount}`}>
            Hoy
          </Link>
          <Link className="btn btn-ghost" href={`/calendario?start=${next}&days=${dayCount}`}>
            Período →
          </Link>
          <Link className="btn btn-ghost" href={`/calendario?start=${startIso}&days=7`}>
            7d
          </Link>
          <Link className="btn btn-ghost" href={`/calendario?start=${startIso}&days=14`}>
            14d
          </Link>
          <Link className="btn btn-ghost" href="/consultas/nueva">
            Nueva consulta
          </Link>
          <Link className="btn btn-ghost" href="/optimizador">
            Optimizar
          </Link>
          <Link className="btn btn-primary" href="/reservas/nueva">
            Nueva reserva
          </Link>
        </div>
      </div>

      <div className="panel overflow-auto rounded-xl">
        <div style={{ minWidth: 140 + days.length * cell }}>
          <div className="flex border-b border-[var(--line)] bg-[#fffdf8] sticky top-0 z-20">
            <div className="sticky left-0 z-30 w-[140px] shrink-0 border-r border-[var(--line)] bg-[#fffdf8] px-3 py-2 text-xs font-semibold text-[var(--muted)]">
              Habitación
            </div>
            {days.map((d) => (
              <div
                key={d.iso}
                className="shrink-0 border-r border-[var(--line)] py-1 text-center text-[10px]"
                style={{ width: cell }}
              >
                <div className="uppercase text-[var(--muted)]">{d.weekday}</div>
                <div className="font-semibold">{d.label}</div>
              </div>
            ))}
          </div>

          {units.map((unit) => (
            <div
              key={unit.id}
              className="relative flex border-b border-[var(--line)]"
              style={{ height: 40 }}
            >
              <div className="sticky left-0 z-10 flex w-[140px] shrink-0 flex-col justify-center border-r border-[var(--line)] bg-[#fffdf8] px-3">
                <div className="text-sm font-semibold leading-tight">{unit.code}</div>
                <div className="truncate text-[10px] text-[var(--muted)]">
                  {unit.category}
                  {unit.composites.length
                    ? ` · comunicada ${unit.composites.join(",")}`
                    : ""}
                </div>
              </div>
              <div className="relative flex-1">
                <div className="absolute inset-0 flex">
                  {days.map((d, di) => {
                    const occupied = unit.blocks.some(
                      (b) => di >= b.startOffset && di < b.startOffset + b.span,
                    );
                    if (occupied) {
                      return (
                        <div
                          key={d.iso}
                          className="h-full border-r border-[var(--line)] bg-white/30"
                          style={{ width: cell }}
                        />
                      );
                    }
                    const checkOut = shiftIso(d.iso, 1);
                    return (
                      <Link
                        key={d.iso}
                        href={`/reservas/nueva?unitId=${unit.id}&checkIn=${d.iso}&checkOut=${checkOut}`}
                        className="h-full border-r border-[var(--line)] bg-white/30 hover:bg-[var(--brand)]/10"
                        style={{ width: cell }}
                        title={`Nueva reserva · ${unit.code} · ${d.iso}`}
                      />
                    );
                  })}
                </div>
                {unit.blocks.map((b) => (
                  <Link
                    key={`${b.reservationId}-${b.startOffset}-${b.span}`}
                    href={`/reservas/${b.reservationId}`}
                    className="calendar-block"
                    title={`${b.code} · ${RESERVATION_STATUS_LABEL[b.status]}${b.doNotMove ? " · no mover" : ""}`}
                    style={{
                      left: b.startOffset * cell + 2,
                      width: Math.max(b.span * cell - 4, 8),
                      background: b.color,
                      top: 6,
                      height: 28,
                      position: "absolute",
                    }}
                  >
                    {b.doNotMove ? "🔒 " : ""}
                    {b.guestName || b.code}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
        {(Object.keys(RESERVATION_STATUS_LABEL) as (keyof typeof RESERVATION_STATUS_LABEL)[]).map(
          (k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: RESERVATION_STATUS_COLOR[k] }}
              />
              {RESERVATION_STATUS_LABEL[k]}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

function shiftIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
