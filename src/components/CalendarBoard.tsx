"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { RESERVATION_STATUS_LABEL, RESERVATION_STATUS_COLOR } from "@/lib/status";
import { HelpTooltip } from "@/components/HelpTooltip";
import {
  CreateStayPanel,
  type CreateStaySeed,
} from "@/components/CreateStayPanel";
import { howManyDaysFit } from "@/lib/hotel-calendar";
import type { CalendarDay, CalendarUnitRow } from "@/lib/calendar";

const CELL = 42;
const LABEL_W = 140;
const MAX_WINDOW_DAYS = 90;
const CHUNK = 21;
const EDGE_DAYS = 4;

type Attr = { id: string; key: string; label: string };

type CalendarPayload = {
  startIso: string;
  dayCount: number;
  days: CalendarDay[];
  units: CalendarUnitRow[];
};

type Props = {
  focusIso: string;
  attributes: Attr[];
  initial: CalendarPayload;
};

function shiftIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string) {
  const ms =
    new Date(`${b}T00:00:00.000Z`).getTime() -
    new Date(`${a}T00:00:00.000Z`).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

export function CalendarBoard({ focusIso, attributes, initial }: Props) {
  const [days, setDays] = useState<CalendarDay[]>(initial.days);
  const [units, setUnits] = useState<CalendarUnitRow[]>(initial.units);
  const [windowStart, setWindowStart] = useState(initial.startIso);
  const [loadingEdge, setLoadingEdge] = useState<"left" | "right" | null>(null);
  const [visibleDays, setVisibleDays] = useState(
    () => initial.days.length || howManyDaysFit(900),
  );
  const [draft, setDraft] = useState<{ open: boolean; seed: CreateStaySeed }>({
    open: false,
    seed: { mode: "reserva" },
  });

  const scrollerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const centeredOnce = useRef(false);
  const loadingLock = useRef(false);
  const pendingScrollAdjust = useRef<number | null>(null);
  const daysRef = useRef(days);
  const windowStartRef = useRef(windowStart);
  daysRef.current = days;
  windowStartRef.current = windowStart;

  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const update = () => {
      setVisibleDays(
        howManyDaysFit(el.clientWidth, { labelWidth: LABEL_W, cellWidth: CELL }),
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (pendingScrollAdjust.current == null) return;
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollLeft += pendingScrollAdjust.current;
    pendingScrollAdjust.current = null;
  }, [days, windowStart]);

  useLayoutEffect(() => {
    if (centeredOnce.current) return;
    const scroller = scrollerRef.current;
    if (!scroller || !days.length) return;
    const idx = days.findIndex((d) => d.iso === focusIso);
    if (idx < 0) return;
    const target =
      LABEL_W +
      idx * CELL -
      Math.max(0, (scroller.clientWidth - LABEL_W) / 2 - CELL / 2);
    scroller.scrollLeft = Math.max(0, target);
    centeredOnce.current = true;
  }, [days, focusIso]);

  const loadWindow = useCallback(
    async (
      start: string,
      dayCount: number,
      opts?: { side?: "left" | "right" | "replace"; prevStart?: string },
    ) => {
      if (loadingLock.current && opts?.side !== "replace") return;
      loadingLock.current = true;
      if (opts?.side === "left" || opts?.side === "right") {
        setLoadingEdge(opts.side);
      }
      try {
        const capped = Math.min(MAX_WINDOW_DAYS, Math.max(1, dayCount));
        const res = await fetch(
          `/api/calendar?${new URLSearchParams({
            start,
            days: String(capped),
          })}`,
        );
        if (!res.ok) return;
        const payload = (await res.json()) as CalendarPayload;
        if (opts?.side === "left" && opts.prevStart) {
          const prepended = daysBetween(payload.startIso, opts.prevStart);
          if (prepended > 0) pendingScrollAdjust.current = prepended * CELL;
        }
        if (opts?.side === "right" && opts.prevStart) {
          const dropped = daysBetween(opts.prevStart, payload.startIso);
          if (dropped > 0) pendingScrollAdjust.current = -(dropped * CELL);
        }
        setWindowStart(payload.startIso);
        setDays(payload.days);
        setUnits(payload.units);
      } finally {
        loadingLock.current = false;
        setLoadingEdge(null);
      }
    },
    [],
  );

  // Grow initial buffer when viewport is wider than loaded window
  useEffect(() => {
    const needed = Math.min(MAX_WINDOW_DAYS, Math.max(visibleDays * 2 + 7, CHUNK * 2));
    if (daysRef.current.length >= needed) return;
    const half = Math.floor(needed / 2);
    centeredOnce.current = false;
    void loadWindow(shiftIso(focusIso, -half), needed, { side: "replace" });
  }, [visibleDays, focusIso, loadWindow]);

  const onScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller || loadingLock.current) return;
    const curDays = daysRef.current;
    const curStart = windowStartRef.current;
    if (!curDays.length) return;

    const daysAreaLeft = scroller.scrollLeft;
    const daysViewport = Math.max(0, scroller.clientWidth - LABEL_W);
    const leftIdx = Math.floor(daysAreaLeft / CELL);
    const rightIdx = Math.ceil((daysAreaLeft + daysViewport) / CELL);

    if (leftIdx < EDGE_DAYS) {
      const extend = CHUNK;
      const newStart = shiftIso(curStart, -extend);
      const total = Math.min(MAX_WINDOW_DAYS, curDays.length + extend);
      void loadWindow(newStart, total, { side: "left", prevStart: curStart });
    } else if (rightIdx > curDays.length - EDGE_DAYS) {
      const extend = CHUNK;
      let newStart = curStart;
      let total = curDays.length + extend;
      if (total > MAX_WINDOW_DAYS) {
        const drop = total - MAX_WINDOW_DAYS;
        newStart = shiftIso(curStart, drop);
        total = MAX_WINDOW_DAYS;
      }
      void loadWindow(newStart, total, { side: "right", prevStart: curStart });
    }
  };

  function openCreate(seed: CreateStaySeed) {
    setDraft({ open: true, seed });
  }

  function jumpToFocus() {
    centeredOnce.current = false;
    const half = Math.floor(Math.min(MAX_WINDOW_DAYS, visibleDays * 2 + 7) / 2);
    void loadWindow(shiftIso(focusIso, -half), half * 2 + 1, { side: "replace" });
  }

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
            Columnas según el ancho · scroll horizontal con más fechas · foco{" "}
            <strong className="font-semibold text-[var(--ink)]">{focusIso}</strong>
            <HelpTooltip text="Si el hotel está cerrado hoy, el calendario se centra en la próxima apertura. Los días cerrados van grisados y no permiten crear." />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-ghost" onClick={jumpToFocus}>
            Hoy / apertura
          </button>
          <Link className="btn btn-ghost" href="/optimizador">
            Optimizar
          </Link>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              openCreate({
                mode: "consulta",
                checkInDate: focusIso,
                checkOutDate: shiftIso(focusIso, 2),
              })
            }
          >
            Nueva consulta
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              openCreate({
                mode: "reserva",
                checkInDate: focusIso,
                checkOutDate: shiftIso(focusIso, 2),
              })
            }
          >
            Nueva reserva
          </button>
        </div>
      </div>

      <div className={`calendar-shell ${draft.open ? "calendar-shell-with-drawer" : ""}`}>
        <div className="calendar-main min-w-0" ref={measureRef}>
          <div
            ref={scrollerRef}
            className="panel overflow-auto rounded-xl"
            style={{ maxHeight: "calc(100vh - 220px)" }}
            onScroll={onScroll}
          >
            <div style={{ minWidth: LABEL_W + days.length * CELL }}>
              <div className="sticky top-0 z-20 flex border-b border-[var(--line)] bg-[#fffdf8]">
                <div
                  className="sticky left-0 z-30 shrink-0 border-r border-[var(--line)] bg-[#fffdf8] px-3 py-2 text-xs font-semibold text-[var(--muted)]"
                  style={{ width: LABEL_W }}
                >
                  Habitación
                  {loadingEdge ? (
                    <span className="ml-1 live-pulse text-[10px] text-[var(--brand)]">
                      {loadingEdge === "left" ? "←" : "→"}
                    </span>
                  ) : null}
                </div>
                {days.map((d) => (
                  <div
                    key={d.iso}
                    className={`shrink-0 border-r border-[var(--line)] py-1 text-center text-[10px] ${
                      d.closed
                        ? "cal-day-closed"
                        : d.iso === focusIso
                          ? "cal-day-focus"
                          : ""
                    }`}
                    style={{ width: CELL }}
                    title={d.closed ? `${d.iso} · hotel cerrado` : d.iso}
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
                  <div
                    className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-[var(--line)] bg-[#fffdf8] px-3"
                    style={{ width: LABEL_W }}
                  >
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
                        if (d.closed) {
                          return (
                            <div
                              key={d.iso}
                              className="cal-cell-closed h-full border-r border-[var(--line)]"
                              style={{ width: CELL }}
                              title="Hotel cerrado"
                            />
                          );
                        }
                        if (occupied) {
                          return (
                            <div
                              key={d.iso}
                              className="h-full border-r border-[var(--line)] bg-white/30"
                              style={{ width: CELL }}
                            />
                          );
                        }
                        return (
                          <button
                            key={d.iso}
                            type="button"
                            className="h-full border-r border-[var(--line)] bg-white/30 hover:bg-[var(--brand)]/10"
                            style={{ width: CELL }}
                            title={`Nueva reserva · ${unit.code} · ${d.iso}`}
                            onClick={() =>
                              openCreate({
                                mode: "reserva",
                                physicalUnitId: unit.id,
                                checkInDate: d.iso,
                                checkOutDate: shiftIso(d.iso, 1),
                              })
                            }
                          />
                        );
                      })}
                    </div>
                    {unit.blocks.map((b) => (
                      <Link
                        key={`${b.reservationId}-${b.startOffset}-${b.span}`}
                        href={`/reservas/${b.reservationId}`}
                        className="calendar-block"
                        title={`${b.code} · ${RESERVATION_STATUS_LABEL[b.status]}${b.doNotMove ? " · fijada" : ""}`}
                        style={{
                          left: b.startOffset * CELL + 2,
                          width: Math.max(b.span * CELL - 4, 8),
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
        </div>

        {draft.open ? (
          <aside className="create-drawer panel rounded-xl" aria-label="Alta rápida">
            <CreateStayPanel
              key={`${draft.seed.mode}-${draft.seed.checkInDate}-${draft.seed.physicalUnitId || "x"}-${draft.open}`}
              attributes={attributes}
              seed={draft.seed}
              onClose={() => setDraft((s) => ({ ...s, open: false }))}
            />
          </aside>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
        {(
          Object.keys(RESERVATION_STATUS_LABEL) as (keyof typeof RESERVATION_STATUS_LABEL)[]
        ).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: RESERVATION_STATUS_COLOR[k] }}
            />
            {RESERVATION_STATUS_LABEL[k]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#c4bdb0]" />
          Hotel cerrado
        </span>
      </div>
    </div>
  );
}
