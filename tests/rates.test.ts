import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, ServiceType } from "@prisma/client";
import {
  createRatePeriod,
  findPeriodOverlaps,
  pickMostSpecificRate,
  savePeriodCells,
  suggestPriceBreakdown,
} from "../src/lib/rates";
import { toDateOnly } from "../src/lib/dates";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("PMS-13 tariffs matrix + night-by-night", () => {
  let stdId: string;
  const createdPeriodIds: string[] = [];

  beforeAll(async () => {
    const std = await prisma.commercialCategory.findUniqueOrThrow({ where: { code: "STD" } });
    stdId = std.id;
  });

  afterAll(async () => {
    for (const id of createdPeriodIds) {
      await prisma.rate.deleteMany({ where: { periodId: id } });
      await prisma.ratePeriod.delete({ where: { id } }).catch(() => undefined);
    }
  });

  it("pickMostSpecificRate prefers shorter span then latest updatedAt", () => {
    const long = {
      amountArs: 100,
      validFrom: toDateOnly("2026-01-01"),
      validTo: toDateOnly("2026-12-31"),
      updatedAt: new Date("2026-01-01"),
      periodId: "a",
      periodName: "Año",
    };
    const short = {
      amountArs: 150,
      validFrom: toDateOnly("2026-01-10"),
      validTo: toDateOnly("2026-01-12"),
      updatedAt: new Date("2026-01-01"),
      periodId: "b",
      periodName: "Finde",
    };
    expect(pickMostSpecificRate([long, short])?.amountArs).toBe(150);

    const shortOld = { ...short, updatedAt: new Date("2025-01-01"), amountArs: 140 };
    const shortNew = { ...short, updatedAt: new Date("2026-06-01"), amountArs: 160 };
    expect(pickMostSpecificRate([shortOld, shortNew])?.amountArs).toBe(160);
  });

  it("findPeriodOverlaps detects intersecting seasons", () => {
    const overlaps = findPeriodOverlaps([
      {
        id: "1",
        name: "Verano",
        validFrom: toDateOnly("2026-12-15"),
        validTo: toDateOnly("2027-02-28"),
        active: true,
      },
      {
        id: "2",
        name: "Año nuevo",
        validFrom: toDateOnly("2026-12-30"),
        validTo: toDateOnly("2027-01-02"),
        active: true,
      },
      {
        id: "3",
        name: "Otoño",
        validFrom: toDateOnly("2027-03-01"),
        validTo: toDateOnly("2027-04-30"),
        active: true,
      },
    ]);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.aName).toMatch(/Verano|Año/);
  });

  it("savePeriodCells + suggestPriceBreakdown night-by-night with overlap win", async () => {
    const base = await createRatePeriod(prisma, {
      name: `Test Base ${Date.now()}`,
      validFrom: "2029-01-01",
      validTo: "2029-01-10",
    });
    createdPeriodIds.push(base.id);

    const spike = await createRatePeriod(prisma, {
      name: `Test Spike ${Date.now()}`,
      validFrom: "2029-01-03",
      validTo: "2029-01-04",
    });
    createdPeriodIds.push(spike.id);

    await savePeriodCells(prisma, base.id, [
      {
        commercialCategoryId: stdId,
        serviceType: ServiceType.DESAYUNO,
        amountArs: 50000,
      },
    ]);
    await savePeriodCells(prisma, spike.id, [
      {
        commercialCategoryId: stdId,
        serviceType: ServiceType.DESAYUNO,
        amountArs: 80000,
      },
    ]);

    const breakdown = await suggestPriceBreakdown(prisma, {
      commercialCategoryId: stdId,
      serviceType: ServiceType.DESAYUNO,
      checkInDate: "2029-01-02",
      checkOutDate: "2029-01-06",
    });

    expect(breakdown.nights).toHaveLength(4);
    expect(breakdown.hasGaps).toBe(false);
    // nights: 02, 03, 04, 05 → spike covers 03-04 inclusive
    const byDate = Object.fromEntries(breakdown.nights.map((n) => [n.date, n.amountArs]));
    expect(byDate["2029-01-02"]).toBe(50000);
    expect(byDate["2029-01-03"]).toBe(80000);
    expect(byDate["2029-01-04"]).toBe(80000);
    expect(byDate["2029-01-05"]).toBe(50000);
    expect(breakdown.totalArs).toBe(50000 + 80000 + 80000 + 50000);
  });

  it("empty cell yields missing night (sin tarifa)", async () => {
    const period = await createRatePeriod(prisma, {
      name: `Test Hueco ${Date.now()}`,
      validFrom: "2029-06-01",
      validTo: "2029-06-03",
    });
    createdPeriodIds.push(period.id);
    // Far future: unlikely covered by seed Temporada base (~now+365)
    const far = await createRatePeriod(prisma, {
      name: `Test Far ${Date.now()}`,
      validFrom: "2035-01-01",
      validTo: "2035-01-02",
    });
    createdPeriodIds.push(far.id);
    const farBreak = await suggestPriceBreakdown(prisma, {
      commercialCategoryId: stdId,
      serviceType: ServiceType.SIN_DESAYUNO,
      checkInDate: "2035-01-01",
      checkOutDate: "2035-01-03",
    });
    expect(farBreak.hasGaps).toBe(true);
    expect(farBreak.nights.some((n) => n.missing)).toBe(true);
    expect(farBreak.totalArs).toBeNull();
  });
});
