import { addDays, format, parseISO } from "date-fns";

/** Normalize to UTC date-only (midnight) for overnight hotel stays. */
export function toDateOnly(input: Date | string): Date {
  if (typeof input === "string") {
    const d = parseISO(input.length === 10 ? `${input}T00:00:00.000Z` : input);
    return startOfDayUtc(d);
  }
  return startOfDayUtc(input);
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Half-open interval [start, end): checkout day is free. */
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function eachNight(start: Date, end: Date): Date[] {
  const nights: Date[] = [];
  let cur = toDateOnly(start);
  const last = toDateOnly(end);
  while (cur < last) {
    nights.push(cur);
    cur = addDays(cur, 1);
  }
  return nights;
}

export function isoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function parseIsoDate(s: string): Date {
  return toDateOnly(s);
}
