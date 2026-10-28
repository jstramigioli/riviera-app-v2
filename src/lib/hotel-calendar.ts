import { addDays } from "date-fns";
import { eachNight, isoDate, rangesOverlap, toDateOnly } from "./dates";

export type ClosedPeriodRange = {
  id?: string;
  name?: string;
  /** Inclusive first closed night */
  closedFrom: Date;
  /** Inclusive last closed night */
  closedTo: Date;
};

/** Half-open [from, toExclusive) covering inclusive closed nights. */
export function closedPeriodHalfOpen(period: ClosedPeriodRange): {
  start: Date;
  endExclusive: Date;
} {
  return {
    start: toDateOnly(period.closedFrom),
    endExclusive: addDays(toDateOnly(period.closedTo), 1),
  };
}

export function isDateClosed(
  date: Date | string,
  periods: ClosedPeriodRange[],
): boolean {
  const d = toDateOnly(date);
  return periods.some((p) => {
    const { start, endExclusive } = closedPeriodHalfOpen(p);
    return d >= start && d < endExclusive;
  });
}

/** First open calendar day on or after `from` (searches forward up to ~2y). */
export function nextOpenDate(
  from: Date | string,
  periods: ClosedPeriodRange[],
  maxDays = 800,
): Date {
  let d = toDateOnly(from);
  for (let i = 0; i < maxDays; i++) {
    if (!isDateClosed(d, periods)) return d;
    d = addDays(d, 1);
  }
  return toDateOnly(from);
}

/**
 * Calendar focus: today if hotel open that day; otherwise next opening date.
 */
export function calendarFocusDate(
  today: Date | string,
  periods: ClosedPeriodRange[],
): Date {
  const t = toDateOnly(today);
  return isDateClosed(t, periods) ? nextOpenDate(t, periods) : t;
}

/** Closed nights that intersect stay [checkIn, checkOut). */
export function closedNightsInStay(
  checkIn: Date | string,
  checkOut: Date | string,
  periods: ClosedPeriodRange[],
): Date[] {
  return eachNight(toDateOnly(checkIn), toDateOnly(checkOut)).filter((n) =>
    isDateClosed(n, periods),
  );
}

export function stayTouchesClosedPeriod(
  checkIn: Date | string,
  checkOut: Date | string,
  periods: ClosedPeriodRange[],
): boolean {
  const start = toDateOnly(checkIn);
  const end = toDateOnly(checkOut);
  if (!(start < end)) return false;
  return periods.some((p) => {
    const { start: cStart, endExclusive } = closedPeriodHalfOpen(p);
    return rangesOverlap(start, end, cStart, endExclusive);
  });
}

export function assertStayDatesOpen(
  checkIn: Date | string,
  checkOut: Date | string,
  periods: ClosedPeriodRange[],
): void {
  const closed = closedNightsInStay(checkIn, checkOut, periods);
  if (!closed.length) return;
  const sample = closed.slice(0, 3).map(isoDate).join(", ");
  const more = closed.length > 3 ? ` (+${closed.length - 3})` : "";
  throw new Error(
    `El hotel está cerrado en fechas de la estadía (${sample}${more}). Elegí fechas en período de apertura.`,
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
