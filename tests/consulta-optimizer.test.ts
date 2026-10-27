import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { listLiveAvailability } from "../src/lib/availability";
import { convertQueryToReservation, upsertQueryDraft } from "../src/lib/queries";
import {
  applyOccupancyOptimizer,
  previewOccupancyOptimizer,
} from "../src/lib/optimizer";
import { toDateOnly } from "../src/lib/dates";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("PMS-9 consultas + conversion", () => {
  const ids: { query?: string; reservation?: string; reservation2?: string } = {};
  let unit8: string;
  let unit9: string;
  let balconId: string;

  beforeAll(async () => {
    const u8 = await prisma.physicalUnit.findUniqueOrThrow({ where: { code: "8" } });
    const u9 = await prisma.physicalUnit.findUniqueOrThrow({ where: { code: "9" } });
    const balcon = await prisma.unitAttribute.findUniqueOrThrow({ where: { key: "balcon" } });
    unit8 = u8.id;
    unit9 = u9.id;
    balconId = balcon.id;

    // Ensure unit 8 has balcon for matching tests; unit without may vary by seed
    await prisma.unitAttributeLink.upsert({
      where: { unitId_attributeId: { unitId: unit8, attributeId: balconId } },
      update: {},
      create: { unitId: unit8, attributeId: balconId },
    });
  });

  afterAll(async () => {
    if (ids.query) {
      await prisma.query.updateMany({
        where: { id: ids.query },
        data: { convertedReservationId: null },
      });
      await prisma.queryRequirement.deleteMany({ where: { queryId: ids.query } });
      await prisma.query.delete({ where: { id: ids.query } }).catch(() => undefined);
    }
    for (const rid of [ids.reservation, ids.reservation2]) {
      if (!rid) continue;
      await prisma.query.updateMany({
        where: { convertedReservationId: rid },
        data: { convertedReservationId: null },
      });
      await prisma.assignmentSegment.deleteMany({ where: { reservationId: rid } });
      await prisma.reservationGuest.deleteMany({ where: { reservationId: rid } });
      await prisma.reservationRequirement.deleteMany({ where: { reservationId: rid } });
      await prisma.reservation.delete({ where: { id: rid } }).catch(() => undefined);
    }
  });

  it("consulta draft has no room and does not block availability", async () => {
    const q = await upsertQueryDraft({
      checkInDate: "2028-03-01",
      checkOutDate: "2028-03-04",
      guestFirstName: "Ana",
      guestLastName: "Consulta",
      structuredRequirements: [{ attributeId: balconId, kind: "MANDATORY" }],
    });
    ids.query = q.id;

    expect(q.status).toBe("OPEN");
    const segs = await prisma.assignmentSegment.count({
      where: { reservation: { code: q.code } },
    });
    expect(segs).toBe(0);

    const live = await listLiveAvailability(prisma, {
      checkInDate: "2028-03-01",
      checkOutDate: "2028-03-04",
    });
    expect(live.candidates.some((c) => c.id === unit8 && c.kind === "unit")).toBe(true);
  });

  it("softMandatory includes non-matching rooms with meetsMandatory=false", async () => {
    // Pick a unit that does NOT have balcon
    const units = await prisma.physicalUnit.findMany({
      where: { active: true, kind: "HABITACION" },
      include: { attributes: true },
    });
    const without = units.find((u) => !u.attributes.some((a) => a.attributeId === balconId));
    expect(without).toBeTruthy();

    const hard = await listLiveAvailability(prisma, {
      checkInDate: "2028-03-10",
      checkOutDate: "2028-03-12",
      mandatoryAttributeIds: [balconId],
      softMandatory: false,
    });
    expect(hard.candidates.every((c) => c.meetsMandatory)).toBe(true);
    expect(hard.candidates.some((c) => c.id === without!.id)).toBe(false);

    const soft = await listLiveAvailability(prisma, {
      checkInDate: "2028-03-10",
      checkOutDate: "2028-03-12",
      mandatoryAttributeIds: [balconId],
      softMandatory: true,
    });
    const softHit = soft.candidates.find((c) => c.id === without!.id && c.kind === "unit");
    expect(softHit).toBeTruthy();
    expect(softHit!.meetsMandatory).toBe(false);
    expect(softHit!.missingMandatoryLabels.length).toBeGreaterThan(0);
  });

  it("convert creates reservation with room; rejects without override when tags fail", async () => {
    const q = await upsertQueryDraft({
      id: ids.query,
      checkInDate: "2028-04-01",
      checkOutDate: "2028-04-03",
      guestFirstName: "Ana",
      guestLastName: "Consulta",
      structuredRequirements: [{ attributeId: balconId, kind: "MANDATORY" }],
    });

    const units = await prisma.physicalUnit.findMany({
      where: { active: true },
      include: { attributes: true },
    });
    const without = units.find((u) => !u.attributes.some((a) => a.attributeId === balconId));
    expect(without).toBeTruthy();

    await expect(
      convertQueryToReservation({
        queryId: q.id,
        physicalUnitId: without!.id,
        status: "PRERRESERVA",
      }),
    ).rejects.toThrow(/características obligatorias/i);

    const withBalcon = units.find((u) =>
      u.attributes.some((a) => a.attributeId === balconId),
    );
    expect(withBalcon).toBeTruthy();

    const reservation = await convertQueryToReservation({
      queryId: q.id,
      physicalUnitId: withBalcon!.id,
      status: "PRERRESERVA",
      roomLocked: false,
    });
    ids.reservation = reservation.id;

    expect(reservation.status).toBe("PRERRESERVA");
    expect(reservation.segments.length).toBeGreaterThan(0);
    const updatedQ = await prisma.query.findUniqueOrThrow({ where: { id: q.id } });
    expect(updatedQ.status).toBe("CONVERTED");
    expect(updatedQ.convertedReservationId).toBe(reservation.id);
  });

  it("override conversion requires note and persists room despite missing tags", async () => {
    const q2 = await upsertQueryDraft({
      checkInDate: "2028-05-01",
      checkOutDate: "2028-05-03",
      guestFirstName: "Luis",
      guestLastName: "Override",
      structuredRequirements: [{ attributeId: balconId, kind: "MANDATORY" }],
    });

    const units = await prisma.physicalUnit.findMany({
      where: { active: true },
      include: { attributes: true },
    });
    const without = units.find((u) => !u.attributes.some((a) => a.attributeId === balconId));

    await expect(
      convertQueryToReservation({
        queryId: q2.id,
        physicalUnitId: without!.id,
        allowMandatoryOverride: true,
      }),
    ).rejects.toThrow(/motivo/i);

    const reservation = await convertQueryToReservation({
      queryId: q2.id,
      physicalUnitId: without!.id,
      allowMandatoryOverride: true,
      overrideNote: "Cliente acepta sin balcón",
      status: "PRERRESERVA",
    });
    ids.reservation2 = reservation.id;
    expect(reservation.segments[0]?.physicalUnitId).toBe(without!.id);
    expect(reservation.notes || "").toMatch(/Override/);

    await prisma.queryRequirement.deleteMany({ where: { queryId: q2.id } });
    await prisma.query.delete({ where: { id: q2.id } });
  });
});

describe("PMS-10 optimizer constraints", () => {
  const created: string[] = [];
  let unitA: string;
  let unitB: string;
  let unitC: string;

  beforeAll(async () => {
    const units = await prisma.physicalUnit.findMany({
      where: { active: true, kind: "HABITACION" },
      orderBy: { sortOrder: "asc" },
      take: 6,
    });
    // Prefer high numbers less likely used by other tests
    unitA = units[3]!.id;
    unitB = units[4]!.id;
    unitC = units[5]!.id;
  });

  afterAll(async () => {
    for (const id of created) {
      await prisma.assignmentSegment.deleteMany({ where: { reservationId: id } });
      await prisma.reservation.delete({ where: { id } }).catch(() => undefined);
    }
  });

  async function makeRes(opts: {
    code: string;
    unitId: string;
    start: string;
    end: string;
    status?: "PRERRESERVA" | "CONFIRMADA" | "IN_HOUSE";
    doNotMove?: boolean;
  }) {
    const start = toDateOnly(opts.start);
    const end = toDateOnly(opts.end);
    const r = await prisma.reservation.create({
      data: {
        code: opts.code,
        status: opts.status ?? "PRERRESERVA",
        doNotMove: opts.doNotMove ?? false,
        checkInDate: start,
        checkOutDate: end,
        segments: {
          create: [{ physicalUnitId: opts.unitId, startDate: start, endDate: end }],
        },
      },
      include: { segments: true },
    });
    created.push(r.id);
    return r;
  }

  it("never proposes moves for fixed or in-house reservations", async () => {
    const stamp = Date.now();
    await makeRes({
      code: `OPT-FIX-${stamp}`,
      unitId: unitA,
      start: "2028-06-01",
      end: "2028-06-04",
      doNotMove: true,
      status: "PRERRESERVA",
    });
    await makeRes({
      code: `OPT-IH-${stamp}`,
      unitId: unitB,
      start: "2028-06-01",
      end: "2028-06-04",
      status: "IN_HOUSE",
    });
    // Flexible neighbor that could theoretically move
    await makeRes({
      code: `OPT-FL-${stamp}`,
      unitId: unitC,
      start: "2028-06-10",
      end: "2028-06-12",
      status: "PRERRESERVA",
      doNotMove: false,
    });

    const preview = await previewOccupancyOptimizer(prisma, {
      windowStart: "2028-06-01",
      windowEnd: "2028-06-15",
    });

    expect(preview.fixedSkipped).toBeGreaterThanOrEqual(1);
    expect(preview.inHouseSkipped).toBeGreaterThanOrEqual(1);
    expect(
      preview.moves.every((m) => !m.reservationCode.startsWith("OPT-FIX")),
    ).toBe(true);
    expect(
      preview.moves.every((m) => !m.reservationCode.startsWith("OPT-IH")),
    ).toBe(true);
  });

  it("apply rejects fixed and in-house even if forced in payload", async () => {
    const stamp = Date.now();
    const fixed = await makeRes({
      code: `OPT-AF-${stamp}`,
      unitId: unitA,
      start: "2028-07-01",
      end: "2028-07-03",
      doNotMove: true,
    });
    const inHouse = await makeRes({
      code: `OPT-AI-${stamp}`,
      unitId: unitB,
      start: "2028-07-01",
      end: "2028-07-03",
      status: "IN_HOUSE",
    });

    await expect(
      applyOccupancyOptimizer(prisma, {
        moves: [{ reservationId: fixed.id, toUnitId: unitC }],
      }),
    ).rejects.toThrow(/fijada/i);

    await expect(
      applyOccupancyOptimizer(prisma, {
        moves: [{ reservationId: inHouse.id, toUnitId: unitC }],
      }),
    ).rejects.toThrow(/en casa/i);
  });

  it("apply moves a flexible reservation to a free room", async () => {
    const stamp = Date.now();
    const flex = await makeRes({
      code: `OPT-MV-${stamp}`,
      unitId: unitA,
      start: "2028-08-01",
      end: "2028-08-03",
      doNotMove: false,
      status: "CONFIRMADA",
    });

    const result = await applyOccupancyOptimizer(prisma, {
      moves: [{ reservationId: flex.id, toUnitId: unitB }],
    });
    expect(result.applied).toBe(1);
    const seg = await prisma.assignmentSegment.findFirstOrThrow({
      where: { reservationId: flex.id },
    });
    expect(seg.physicalUnitId).toBe(unitB);
  });
});
