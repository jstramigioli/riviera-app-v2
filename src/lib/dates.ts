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

/** Wire/API/storage format only — never show this in UI. */
export function isoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function parseIsoDate(s: string): Date {
  return toDateOnly(s);
}

function asDateOnly(input: Date | string): Date {
  return typeof input === "string" && input.length >= 10
    ? toDateOnly(input.slice(0, 10))
    : toDateOnly(input);
}

/** UI display: DD/MM/AAAA (Julián). Accepts Date or ISO date string. */
export function formatDateUi(input: Date | string): string {
  const d = asDateOnly(input);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** UI display: DD/MM (same calendar day, no year). */
export function formatDateShortUi(input: Date | string): string {
  const d = asDateOnly(input);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

/** UI display for timestamps: DD/MM/AAAA HH:mm (UTC wall for consistency). */
export function formatDateTimeUi(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}
