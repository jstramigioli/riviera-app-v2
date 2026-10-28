import { prisma } from "./db";
import type { OpenPeriodRange } from "./hotel-calendar";

/**
 * Hotel open windows = active tariff periods (RatePeriod).
 * Same concept: a temporada defines open nights AND holds rates.
 */
export async function loadActiveOpenPeriods(): Promise<OpenPeriodRange[]> {
  const rows = await prisma.ratePeriod.findMany({
    where: { active: true },
    orderBy: { validFrom: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    openFrom: r.validFrom,
    openTo: r.validTo,
  }));
}
