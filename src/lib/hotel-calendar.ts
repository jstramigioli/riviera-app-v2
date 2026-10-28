import { addDays } from "date-fns";
import { eachNight, isoDate, toDateOnly } from "./dates";

/** Inclusive open window (temporada abierta). */
export type OpenPeriodRange = {
  id?: string;
  name?: string;
  openFrom: Date;
  openTo: Date;
};

/** Half-open [from, toExclusive) covering inclusive open nights. */
export function openPeriodHalfOpen(period: OpenPeriodRange): {
  start: Date;
  endExclusive: Date;
} {
  return {
    start: toDateOnly(period.openFrom),
    endExclusive: addDays(toDateOnly(period.openTo), 1),
  };
}

/** Hotel open only inside at least one active open period. */
export function isDateOpen(
  date: Date | string,
  periods: OpenPeriodRange[],
): boolean {
  if (!periods.length) return false;
  const d = toDateOnly(date);
  return periods.some((p) => {
    const { start, endExclusive } = openPeriodHalfOpen(p);
    return d >= start && d < endExclusive;
  });
}

export function isDateClosed(
  date: Date | string,
  periods: OpenPeriodRange[],
): boolean {
  return !isDateOpen(date, periods);
}

/**
 * First open calendar day on or after `from`.
 * Prefer jumping to the next temporada start when outside all windows.
 */
export function nextOpenDate(
  from: Date | string,
  periods: OpenPeriodRange[],
): Date {
  const d = toDateOnly(from);
  if (isDateOpen(d, periods)) return d;

  let best: Date | null = null;
  for (const p of periods) {
    const { start, endExclusive } = openPeriodHalfOpen(p);
    if (endExclusive <= d) continue; // fully in the past
    const candidate = d >= start && d < endExclusive ? d : start;
    if (candidate < d) continue;
    if (!best || candidate < best) best = candidate;
  }
  return best ?? d;
}

/** Calendar focus: today if inside an open period; else start of next open window. */
export function calendarFocusDate(
  today: Date | string,
  periods: OpenPeriodRange[],
): Date {
  return nextOpenDate(today, periods);
}

/** Nights of the stay that fall outside all open periods. */
export function closedNightsInStay(
  checkIn: Date | string,
  checkOut: Date | string,
  periods: OpenPeriodRange[],
): Date[] {
  return eachNight(toDateOnly(checkIn), toDateOnly(checkOut)).filter((n) =>
    isDateClosed(n, periods),
  );
}

export function stayHasClosedNights(
  checkIn: Date | string,
  checkOut: Date | string,
  periods: OpenPeriodRange[],
): boolean {
  return closedNightsInStay(checkIn, checkOut, periods).length > 0;
}

export function assertStayDatesOpen(
  checkIn: Date | string,
  checkOut: Date | string,
  periods: OpenPeriodRange[],
): void {
  const closed = closedNightsInStay(checkIn, checkOut, periods);
  if (!closed.length) return;
  const sample = closed.slice(0, 3).map(isoDate).join(", ");
  const more = closed.length > 3 ? ` (+${closed.length - 3})` : "";
  throw new Error(
    `El hotel está cerrado en fechas de la estadía (${sample}${more}). Elegí fechas dentro de una temporada abierta.`,
  );
}

export function howManyDaysFit(
  containerWidthPx: number,
  opts?: { labelWidth?: number; cellWidth?: number; minDays?: number },
): number {
  const labelWidth = opts?.labelWidth ?? 140;
  const cellWidth = opts?.cellWidth ?? 42;
  const minDays = opts?.minDays ?? 3;
  const usable = Math.max(0, containerWidthPx - labelWidth);
  return Math.max(minDays, Math.floor(usable / cellWidth));
}
