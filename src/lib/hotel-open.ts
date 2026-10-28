import { prisma } from "./db";
import type { OpenPeriodRange } from "./hotel-calendar";

export async function loadActiveOpenPeriods(): Promise<OpenPeriodRange[]> {
  const rows = await prisma.hotelOpenPeriod.findMany({
    where: { active: true },
    orderBy: { openFrom: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    openFrom: r.openFrom,
    openTo: r.openTo,
  }));
}
