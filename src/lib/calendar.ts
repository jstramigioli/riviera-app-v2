import { addDays, eachDayOfInterval, format } from "date-fns";
import { es } from "date-fns/locale";
import type { ReservationStatus } from "@prisma/client";
import { prisma } from "./db";
import { toDateOnly } from "./dates";
import { BLOCKING_STATUSES } from "./availability";
import { RESERVATION_STATUS_COLOR } from "./status";

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

export async function loadCalendar(startIso: string, days: number) {
  const start = toDateOnly(startIso);
  const end = addDays(start, days);
  const dayList = eachDayOfInterval({ start, end: addDays(end, -1) });

  const units = await prisma.physicalUnit.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: {
      commercialCategory: true,
      compositeMemberships: { include: { composite: true } },
    },
  });

  const composites = await prisma.compositeUnit.findMany({
    where: { active: true },
    include: { members: { include: { unit: true } } },
    orderBy: { code: "asc" },
  });

  const segments = await prisma.assignmentSegment.findMany({
    where: {
      startDate: { lt: end },
      endDate: { gt: start },
      reservation: {
        status: { in: [...BLOCKING_STATUSES, "CONSULTA"] },
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
  });

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

  return {
    start,
    end,
    days: dayList.map((d) => ({
      iso: format(d, "yyyy-MM-dd"),
      label: format(d, "dd", { locale: es }),
      weekday: format(d, "EEE", { locale: es }),
    })),
    units: units.map((u) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      category: u.commercialCategory?.name ?? "—",
      composites: u.compositeMemberships.map((m) => m.composite.code),
      blocks: blocksByUnit.get(u.id) ?? [],
    })),
    composites: composites.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      memberCodes: c.members.map((m) => m.unit.code),
    })),
  };
}
