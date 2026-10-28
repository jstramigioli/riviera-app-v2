import type { PrismaClient, ReservationStatus } from "@prisma/client";
import { BLOCKING_STATUSES } from "./availability";
import { rangesOverlap, toDateOnly } from "./dates";
import { writeAudit } from "./audit";

type Db = PrismaClient;

export type OptimizerMove = {
  reservationId: string;
  reservationCode: string;
  guestName: string | null;
  checkInDate: string;
  checkOutDate: string;
  fromUnitId: string;
  fromUnitCode: string;
  toUnitId: string;
  toUnitCode: string;
  reason: string;
};

export type OptimizerPreview = {
  windowStart: string;
  windowEnd: string;
  movableCount: number;
  fixedSkipped: number;
  inHouseSkipped: number;
  moves: OptimizerMove[];
  scoreBefore: number;
  scoreAfter: number;
  summary: string;
};

type OccupancySeg = {
  reservationId: string;
  unitId: string;
  start: Date;
  end: Date;
  status: ReservationStatus;
  doNotMove: boolean;
  code: string;
  guestName: string | null;
  desiredIds: string[];
  segmentIds: string[];
  isSinglePhysical: boolean;
};

/** Count empty nights between first and last occupied night across units (fragmentation proxy). */
function gapScore(
  segs: { unitId: string; start: Date; end: Date }[],
  units: string[],
  windowStart: Date,
  windowEnd: Date,
): number {
  let gaps = 0;
  for (const unitId of units) {
    const mine = segs
      .filter((s) => s.unitId === unitId)
      .map((s) => ({
        start: s.start < windowStart ? windowStart : s.start,
        end: s.end > windowEnd ? windowEnd : s.end,
      }))
      .filter((s) => s.start < s.end)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    if (mine.length < 2) continue;
    for (let i = 1; i < mine.length; i++) {
      const prev = mine[i - 1]!;
      const cur = mine[i]!;
      if (prev.end < cur.start) {
        gaps += Math.round(
          (cur.start.getTime() - prev.end.getTime()) / (24 * 60 * 60 * 1000),
        );
      }
    }
  }
  return gaps;
}

function isFree(
  segs: { unitId: string; start: Date; end: Date; reservationId: string }[],
  unitId: string,
  start: Date,
  end: Date,
  excludeReservationId: string,
): boolean {
  return !segs.some(
    (s) =>
      s.unitId === unitId &&
      s.reservationId !== excludeReservationId &&
      rangesOverlap(start, end, s.start, s.end),
  );
}

/**
 * Manual occupancy optimizer: proposes reassignments among flexible
 * prerreservas/confirmadas only. Never moves fixed (doNotMove) or IN_HOUSE.
 */
export async function previewOccupancyOptimizer(
  db: Db,
  input: { windowStart: string; windowEnd: string },
): Promise<OptimizerPreview> {
  const windowStart = toDateOnly(input.windowStart);
  const windowEnd = toDateOnly(input.windowEnd);
  if (!(windowStart < windowEnd)) {
    throw new Error("La ventana del optimizador es inválida");
  }

  const units = await db.physicalUnit.findMany({
    where: { active: true },
    include: { attributes: true },
    orderBy: { sortOrder: "asc" },
  });
  const unitIds = units.map((u) => u.id);
  const unitCode = new Map(units.map((u) => [u.id, u.code]));
  const unitAttrs = new Map(
    units.map((u) => [u.id, new Set(u.attributes.map((a) => a.attributeId))]),
  );

  const segments = await db.assignmentSegment.findMany({
    where: {
      startDate: { lt: windowEnd },
      endDate: { gt: windowStart },
      reservation: { status: { in: BLOCKING_STATUSES } },
      compositeUnitId: null,
    },
    include: {
      reservation: {
        include: {
          structuredReqs: true,
          guests: {
            where: { role: "TITULAR" },
            include: { guest: true },
            take: 1,
          },
          segments: true,
        },
      },
      physicalUnit: true,
    },
  });

  // Group by reservation for single-physical-segment stays only
  const byRes = new Map<string, OccupancySeg>();
  let fixedSkipped = 0;
  let inHouseSkipped = 0;

  for (const seg of segments) {
    const r = seg.reservation;
    const existing = byRes.get(r.id);
    if (existing) {
      existing.segmentIds.push(seg.id);
      existing.isSinglePhysical = false;
      continue;
    }
    const guest = r.guests[0]?.guest;
    byRes.set(r.id, {
      reservationId: r.id,
      unitId: seg.physicalUnitId,
      start: r.checkInDate,
      end: r.checkOutDate,
      status: r.status,
      doNotMove: r.doNotMove,
      code: r.code,
      guestName: guest ? `${guest.lastName}, ${guest.firstName}` : null,
      desiredIds: r.structuredReqs.map((x) => x.attributeId),
      segmentIds: [seg.id],
      isSinglePhysical: r.segments.length === 1 && !r.segments[0]?.compositeUnitId,
    });
  }

  const occupancy: { unitId: string; start: Date; end: Date; reservationId: string }[] =
    [...byRes.values()].map((o) => ({
      unitId: o.unitId,
      start: o.start,
      end: o.end,
      reservationId: o.reservationId,
    }));

  const movable: OccupancySeg[] = [];
  for (const o of byRes.values()) {
    if (o.status === "IN_HOUSE") {
      inHouseSkipped += 1;
      continue;
    }
    if (o.doNotMove) {
      fixedSkipped += 1;
      continue;
    }
    if (!o.isSinglePhysical) continue;
    if (o.status !== "PRERRESERVA" && o.status !== "CONFIRMADA") continue;
    movable.push(o);
  }

  const scoreBefore = gapScore(occupancy, unitIds, windowStart, windowEnd);

  // Simulate packing: prefer rooms that already have adjacent stays (fill gaps / cluster)
  const sim = occupancy.map((s) => ({ ...s }));
  const moves: OptimizerMove[] = [];

  // Sort longer stays first for more stable packing
  movable.sort(
    (a, b) =>
      b.end.getTime() -
      b.start.getTime() -
      (a.end.getTime() - a.start.getTime()),
  );

  for (const m of movable) {
    const current = sim.find((s) => s.reservationId === m.reservationId);
    if (!current) continue;

    let bestUnit = current.unitId;
    let bestScore = gapScore(sim, unitIds, windowStart, windowEnd);
    let bestReason = "";

    for (const u of units) {
      if (u.id === current.unitId) continue;
      const attrs = unitAttrs.get(u.id) ?? new Set();
      // Desired tags rank; never hard-block (D-02)
      const desiredHits = m.desiredIds.filter((id) => attrs.has(id)).length;
      const meetsDesired =
        m.desiredIds.length === 0 || desiredHits === m.desiredIds.length;
      if (!isFree(sim, u.id, m.start, m.end, m.reservationId)) continue;

      const trial = sim.map((s) =>
        s.reservationId === m.reservationId ? { ...s, unitId: u.id } : s,
      );
      const score = gapScore(trial, unitIds, windowStart, windowEnd);
      const adjacent = trial.some(
        (s) =>
          s.unitId === u.id &&
          s.reservationId !== m.reservationId &&
          (s.end.getTime() === m.start.getTime() ||
            s.start.getTime() === m.end.getTime()),
      );
      // Prefer: better gap score, then desired match, then adjacency
      const currentBestAttrs = unitAttrs.get(bestUnit) ?? new Set();
      const bestDesiredHits = m.desiredIds.filter((id) =>
        currentBestAttrs.has(id),
      ).length;
      const improved =
        score < bestScore ||
        (score === bestScore && desiredHits > bestDesiredHits) ||
        (score === bestScore &&
          desiredHits === bestDesiredHits &&
          adjacent &&
          u.id !== current.unitId &&
          bestUnit === current.unitId);

      if (improved) {
        bestScore = score;
        bestUnit = u.id;
        bestReason = !meetsDesired
          ? "Reduce huecos (sin todas las características deseadas)"
          : adjacent
            ? "Se junta con otra estadía (menos huecos)"
            : "Reduce huecos libres entre reservas";
      }
    }

    if (bestUnit !== current.unitId) {
      current.unitId = bestUnit;
      moves.push({
        reservationId: m.reservationId,
        reservationCode: m.code,
        guestName: m.guestName,
        checkInDate: m.start.toISOString().slice(0, 10),
        checkOutDate: m.end.toISOString().slice(0, 10),
        fromUnitId: m.unitId,
        fromUnitCode: unitCode.get(m.unitId) ?? "?",
        toUnitId: bestUnit,
        toUnitCode: unitCode.get(bestUnit) ?? "?",
        reason: bestReason,
      });
      // Keep m.unitId as original for from*; current already updated in sim
    }
  }

  const scoreAfter = gapScore(sim, unitIds, windowStart, windowEnd);

  return {
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    movableCount: movable.length,
    fixedSkipped,
    inHouseSkipped,
    moves,
    scoreBefore,
    scoreAfter,
    summary:
      moves.length === 0
        ? "No hay cambios útiles entre las prerreservas/reservas flexibles de esta ventana."
        : `${moves.length} cambio${moves.length === 1 ? "" : "s"} propuesto${moves.length === 1 ? "" : "s"} · huecos ${scoreBefore} → ${scoreAfter}`,
  };
}

export async function applyOccupancyOptimizer(
  db: Db,
  input: {
    moves: { reservationId: string; toUnitId: string }[];
    userId?: string;
  },
): Promise<{ applied: number }> {
  if (!input.moves.length) return { applied: 0 };

  let applied = 0;
  await db.$transaction(async (tx) => {
    for (const move of input.moves) {
      const reservation = await tx.reservation.findUniqueOrThrow({
        where: { id: move.reservationId },
        include: { segments: true },
      });

      if (reservation.doNotMove) {
        throw new Error(
          `No se puede mover ${reservation.code}: habitación fijada`,
        );
      }
      if (reservation.status === "IN_HOUSE") {
        throw new Error(`No se puede mover ${reservation.code}: huésped en casa`);
      }
      if (
        reservation.status !== "PRERRESERVA" &&
        reservation.status !== "CONFIRMADA"
      ) {
        throw new Error(`Estado no movible: ${reservation.code}`);
      }
      if (
        reservation.segments.length !== 1 ||
        reservation.segments[0]?.compositeUnitId
      ) {
        throw new Error(
          `Solo se reasignan estadías de una sola habitación (${reservation.code})`,
        );
      }

      const seg = reservation.segments[0]!;
      if (seg.physicalUnitId === move.toUnitId) continue;

      // Re-check availability excluding this reservation
      const conflicts = await tx.assignmentSegment.findMany({
        where: {
          physicalUnitId: move.toUnitId,
          reservation: {
            status: { in: BLOCKING_STATUSES },
            id: { not: reservation.id },
          },
        },
      });
      const hit = conflicts.some((c) =>
        rangesOverlap(seg.startDate, seg.endDate, c.startDate, c.endDate),
      );
      if (hit) {
        throw new Error(
          `Habitación destino ocupada al aplicar (${reservation.code})`,
        );
      }

      // Desired tags do not block apply (D-02); availability already checked above.

      await tx.assignmentSegment.update({
        where: { id: seg.id },
        data: { physicalUnitId: move.toUnitId },
      });
      applied += 1;
    }
  });

  await writeAudit({
    userId: input.userId,
    action: "optimizer.apply",
    entityType: "Optimizer",
    entityId: null,
    after: { moves: input.moves, applied },
  });

  return { applied };
}
