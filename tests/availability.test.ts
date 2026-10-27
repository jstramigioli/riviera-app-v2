import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  assertAvailable,
  expandCompositeSegments,
  findConflicts,
  listLiveAvailability,
} from "../src/lib/availability";
import { toDateOnly } from "../src/lib/dates";

const prisma = new PrismaClient();

describe("availability engine", () => {
  let unit8: string;
  let unit9: string;
  let composite89: string;
  let reservationId: string | null = null;

  beforeAll(async () => {
    const u8 = await prisma.physicalUnit.findUnique({ where: { code: "8" } });
    const u9 = await prisma.physicalUnit.findUnique({ where: { code: "9" } });
    const c = await prisma.compositeUnit.findUnique({ where: { code: "8+9" } });
    if (!u8 || !u9 || !c) {
      throw new Error("Seed required: units 8,9 and composite 8+9");
    }
    unit8 = u8.id;
    unit9 = u9.id;
    composite89 = c.id;
  });

  afterAll(async () => {
    if (reservationId) {
      await prisma.assignmentSegment.deleteMany({ where: { reservationId } });
      await prisma.reservation.delete({ where: { id: reservationId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("HAB-05 rejects overlapping physical assignment", async () => {
    const start = toDateOnly("2027-06-01");
    const end = toDateOnly("2027-06-05");
    const res = await prisma.reservation.create({
      data: {
        code: `TEST-OV-${Date.now()}`,
        status: "CONFIRMADA",
        checkInDate: start,
        checkOutDate: end,
        agreedPriceArs: 1,
        priceFrozen: true,
        segments: {
          create: [{ physicalUnitId: unit8, startDate: start, endDate: end }],
        },
      },
    });
    reservationId = res.id;

    const conflicts = await findConflicts(prisma, [
      { physicalUnitId: unit8, startDate: "2027-06-03", endDate: "2027-06-07" },
    ]);
    expect(conflicts.length).toBeGreaterThan(0);
  });

  it("HAB-06 composite blocks components", async () => {
    const start = toDateOnly("2027-07-01");
    const end = toDateOnly("2027-07-04");
    const segs = await expandCompositeSegments(prisma, {
      compositeUnitId: composite89,
      startDate: start,
      endDate: end,
    });
    expect(segs.map((s) => s.physicalUnitId).sort()).toEqual([unit8, unit9].sort());

    const res = await prisma.reservation.create({
      data: {
        code: `TEST-COMP-${Date.now()}`,
        status: "CONFIRMADA",
        checkInDate: start,
        checkOutDate: end,
        segments: {
          create: segs.map((s, i) => ({
            physicalUnitId: s.physicalUnitId,
            compositeUnitId: composite89,
            startDate: start,
            endDate: end,
            sortOrder: i,
          })),
        },
      },
    });
    // cleanup previous + keep latest
    if (reservationId) {
      await prisma.assignmentSegment.deleteMany({ where: { reservationId } });
      await prisma.reservation.delete({ where: { id: reservationId } });
    }
    reservationId = res.id;

    await expect(
      assertAvailable(prisma, [
        { physicalUnitId: unit8, startDate: "2027-07-02", endDate: "2027-07-05" },
      ]),
    ).rejects.toThrow(/Habitación no disponible/);
  });

  it("HAB-07 component blocks composite", async () => {
    const start = toDateOnly("2027-08-10");
    const end = toDateOnly("2027-08-12");
    const res = await prisma.reservation.create({
      data: {
        code: `TEST-MEM-${Date.now()}`,
        status: "CONFIRMADA",
        checkInDate: start,
        checkOutDate: end,
        segments: {
          create: [{ physicalUnitId: unit9, startDate: start, endDate: end }],
        },
      },
    });
    if (reservationId) {
      await prisma.assignmentSegment.deleteMany({ where: { reservationId } });
      await prisma.reservation.delete({ where: { id: reservationId } });
    }
    reservationId = res.id;

    const compositeSegs = await expandCompositeSegments(prisma, {
      compositeUnitId: composite89,
      startDate: "2027-08-10",
      endDate: "2027-08-14",
    });
    const conflicts = await findConflicts(prisma, compositeSegs);
    expect(conflicts.some((c) => c.physicalUnitId === unit9)).toBe(true);
  });

  it("HAB-08 lists only free rooms for the requested range", async () => {
    const start = toDateOnly("2027-09-01");
    const end = toDateOnly("2027-09-04");
    const res = await prisma.reservation.create({
      data: {
        code: `TEST-LIVE-${Date.now()}`,
        status: "CONFIRMADA",
        checkInDate: start,
        checkOutDate: end,
        segments: {
          create: [{ physicalUnitId: unit8, startDate: start, endDate: end }],
        },
      },
    });
    if (reservationId) {
      await prisma.assignmentSegment.deleteMany({ where: { reservationId } });
      await prisma.reservation.delete({ where: { id: reservationId } });
    }
    reservationId = res.id;

    const live = await listLiveAvailability(prisma, {
      checkInDate: "2027-09-01",
      checkOutDate: "2027-09-03",
    });
    expect(live.candidates.some((c) => c.id === unit8 && c.kind === "unit")).toBe(false);
    expect(live.candidates.some((c) => c.id === composite89 && c.kind === "communicating")).toBe(
      false,
    );
    expect(live.hasAvailability).toBe(true);
  });

  it("RES-07b mandatory tags filter candidates; preferences only rank", async () => {
    const balcon = await prisma.unitAttribute.findUniqueOrThrow({ where: { key: "balcon" } });
    const liveAll = await listLiveAvailability(prisma, {
      checkInDate: "2027-10-01",
      checkOutDate: "2027-10-03",
    });
    const liveMandatory = await listLiveAvailability(prisma, {
      checkInDate: "2027-10-01",
      checkOutDate: "2027-10-03",
      mandatoryAttributeIds: [balcon.id],
    });
    expect(liveMandatory.candidates.length).toBeGreaterThan(0);
    expect(liveMandatory.candidates.length).toBeLessThanOrEqual(liveAll.candidates.length);
    expect(
      liveMandatory.candidates.every((c) => c.attributeIds.includes(balcon.id)),
    ).toBe(true);

    const livePref = await listLiveAvailability(prisma, {
      checkInDate: "2027-10-01",
      checkOutDate: "2027-10-03",
      preferenceAttributeIds: [balcon.id],
    });
    expect(livePref.candidates.length).toBe(liveAll.candidates.length);
    expect(livePref.candidates[0]?.preferenceHits).toBeGreaterThanOrEqual(
      livePref.candidates.at(-1)?.preferenceHits ?? 0,
    );
  });
});
