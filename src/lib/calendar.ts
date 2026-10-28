import { addDays, eachDayOfInterval, format } from "date-fns";
import { es } from "date-fns/locale";
import type { ReservationStatus } from "@prisma/client";
import { prisma } from "./db";
import { isoDate, toDateOnly } from "./dates";
import { BLOCKING_STATUSES } from "./availability";
import { RESERVATION_STATUS_COLOR } from "./status";
import { isDateClosed } from "./hotel-calendar";
import { loadActiveOpenPeriods } from "./hotel-open";

export { loadActiveOpenPeriods } from "./hotel-open";

export type CalendarBlock = {
  reservationId: string;
  code: string;
  status: ReservationStatus;
  guestName: string | null;
  doNotMove: boolean;
  color: string;
  startOffset: number;
  span: number;
  unitId: string;
};

export type CalendarDay = {
  iso: string;
  label: string;
  weekday: string;
  closed: boolean;
};

export type CalendarUnitRow = {
  id: string;
  code: string;
  name: string;
  category: string;
  composites: string[];
  blocks: CalendarBlock[];
};

/** Calendar centers on system today (not next opening). */
export async function resolveCalendarFocusIso(todayIso?: string): Promise<string> {
  return todayIso ?? isoDate(new Date());
}

export async function loadCalendar(startIso: string, days: number) {
  const start = toDateOnly(startIso);
  const dayCount = Math.min(120, Math.max(1, Math.floor(days)));
  const end = addDays(start, dayCount);
  const dayList = eachDayOfInterval({ start, end: addDays(end, -1) });

  const [units, composites, segments, openPeriods] = await Promise.all([
    prisma.physicalUnit.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: {
        commercialCategory: true,
        compositeMemberships: { include: { composite: true } },
      },
    }),
    prisma.compositeUnit.findMany({
      where: { active: true },
      include: { members: { include: { unit: true } } },
      orderBy: { code: "asc" },
    }),
    // Solo prerreservas/reservas con habitación. Las consultas (Query) no aparecen.
    prisma.assignmentSegment.findMany({
      where: {
        startDate: { lt: end },
        endDate: { gt: start },
        reservation: {
          status: { in: [...BLOCKING_STATUSES] },
        },
      },
      include: {
        reservation: {
          include: {
            guests: {
              where: { role: "TITULAR" },
              include: { guest: true },
              take: 1,
            },
          },
        },
      },
    }),
    loadActiveOpenPeriods(),
  ]);

  const blocksByUnit = new Map<string, CalendarBlock[]>();
  for (const unit of units) blocksByUnit.set(unit.id, []);

  for (const seg of segments) {
    const segStart = seg.startDate < start ? start : seg.startDate;
    const segEnd = seg.endDate > end ? end : seg.endDate;
    const startOffset = Math.round(
      (segStart.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
    );
    const span = Math.max(
      1,
      Math.round((segEnd.getTime() - segStart.getTime()) / (24 * 60 * 60 * 1000)),
    );
    const titular = seg.reservation.guests[0]?.guest;
    const block: CalendarBlock = {
      reservationId: seg.reservationId,
      code: seg.reservation.code,
      status: seg.reservation.status,
      guestName: titular ? titular.lastName : null,
      doNotMove: seg.reservation.doNotMove,
      color: RESERVATION_STATUS_COLOR[seg.reservation.status],
      startOffset,
      span,
      unitId: seg.physicalUnitId,
    };
    blocksByUnit.get(seg.physicalUnitId)?.push(block);
  }

  const daysOut: CalendarDay[] = dayList.map((d) => ({
    iso: format(d, "yyyy-MM-dd"),
    label: format(d, "dd", { locale: es }),
    weekday: format(d, "EEE", { locale: es }),
    closed: isDateClosed(d, openPeriods),
  }));

  return {
    startIso: isoDate(start),
    endIso: isoDate(end),
    dayCount,
    days: daysOut,
    openPeriods: openPeriods.map((p) => ({
      id: p.id,
      name: p.name ?? "",
      openFrom: isoDate(p.openFrom),
      openTo: isoDate(p.openTo),
    })),
    units: units.map(
      (u): CalendarUnitRow => ({
        id: u.id,
        code: u.code,
        name: u.name,
        category: u.commercialCategory?.name ?? "—",
        composites: u.compositeMemberships.map((m) => m.composite.code),
        blocks: blocksByUnit.get(u.id) ?? [],
      }),
    ),
    composites: composites.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      memberCodes: c.members.map((m) => m.unit.code),
    })),
  };
}
