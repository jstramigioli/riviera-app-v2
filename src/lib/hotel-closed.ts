import { prisma } from "./db";
import type { ClosedPeriodRange } from "./hotel-calendar";

export async function loadActiveClosedPeriods(): Promise<ClosedPeriodRange[]> {
  const rows = await prisma.hotelClosedPeriod.findMany({
    where: { active: true },
    orderBy: { closedFrom: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    closedFrom: r.closedFrom,
    closedTo: r.closedTo,
  }));
}
