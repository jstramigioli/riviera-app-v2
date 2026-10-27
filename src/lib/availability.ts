import type { PrismaClient, ReservationStatus } from "@prisma/client";
import { rangesOverlap, toDateOnly } from "./dates";

const BLOCKING_STATUSES: ReservationStatus[] = [
  "PRERRESERVA",
  "CONFIRMADA",
  "IN_HOUSE",
];

export type SegmentInput = {
  physicalUnitId: string;
  compositeUnitId?: string | null;
  startDate: Date | string;
  endDate: Date | string;
};

export type Conflict = {
  physicalUnitId: string;
  conflictingSegmentId: string;
  conflictingReservationId: string;
  startDate: Date;
  endDate: Date;
  reason: string;
};

type Db = PrismaClient;

/** Expand a segment to the physical unit IDs it occupies. */
export async function resolveOccupiedUnitIds(
  db: Db,
  segment: SegmentInput,
): Promise<string[]> {
  if (segment.compositeUnitId) {
    const members = await db.compositeUnitMember.findMany({
      where: { compositeId: segment.compositeUnitId },
      select: { unitId: true },
    });
    if (members.length === 0) {
      throw new Error(`CompositeUnit ${segment.compositeUnitId} has no members`);
    }
    return members.map((m) => m.unitId);
  }
  return [segment.physicalUnitId];
}

/**
 * Also block any composite that includes an occupied physical unit
 * (vice versa of selling composite → block components).
 * Returns physical unit ids that must be free: the direct units plus
 * we check composite occupancy via their member units.
 */
export async function findConflicts(
  db: Db,
  segments: SegmentInput[],
  options?: { excludeReservationId?: string },
): Promise<Conflict[]> {
  const conflicts: Conflict[] = [];

  for (const seg of segments) {
    const start = toDateOnly(seg.startDate);
    const end = toDateOnly(seg.endDate);
    if (!(start < end)) {
      throw new Error("startDate must be before endDate (checkout exclusive)");
    }

    const occupiedIds = await resolveOccupiedUnitIds(db, seg);

    // Existing segments that touch any of these physical units
    const existing = await db.assignmentSegment.findMany({
      where: {
        physicalUnitId: { in: occupiedIds },
        reservation: {
          status: { in: BLOCKING_STATUSES },
          ...(options?.excludeReservationId
            ? { id: { not: options.excludeReservationId } }
            : {}),
        },
      },
      include: {
        reservation: { select: { id: true, code: true, status: true } },
      },
    });

    for (const ex of existing) {
      if (rangesOverlap(start, end, ex.startDate, ex.endDate)) {
        conflicts.push({
          physicalUnitId: ex.physicalUnitId,
          conflictingSegmentId: ex.id,
          conflictingReservationId: ex.reservationId,
          startDate: ex.startDate,
          endDate: ex.endDate,
          reason: `Overlap with ${ex.reservation.code} (${ex.reservation.status}) on unit ${ex.physicalUnitId}`,
        });
      }
    }

    // If booking a single physical unit, also conflict if a composite
    // reservation occupies a composite that includes this unit.
    // (Those are already covered because composite segments store one
    // physicalUnitId per member OR we store one segment per member.)
    // Our model: when booking composite, we create one AssignmentSegment
    // per member physical unit with compositeUnitId set. So the query above
    // already covers both directions when segments are expanded on write.
  }

  return conflicts;
}

/** Assert no conflicts; throws with details. */
export async function assertAvailable(
  db: Db,
  segments: SegmentInput[],
  options?: { excludeReservationId?: string },
): Promise<void> {
  const conflicts = await findConflicts(db, segments, options);
  if (conflicts.length > 0) {
    const msg = conflicts.map((c) => c.reason).join("; ");
    const err = new Error(`Availability conflict: ${msg}`);
    (err as Error & { conflicts: Conflict[] }).conflicts = conflicts;
    throw err;
  }
}

/**
 * Expand a composite booking into one segment per physical member.
 * Callers should use this before assertAvailable + insert.
 */
export async function expandCompositeSegments(
  db: Db,
  input: {
    compositeUnitId: string;
    startDate: Date | string;
    endDate: Date | string;
  },
): Promise<SegmentInput[]> {
  const members = await db.compositeUnitMember.findMany({
    where: { compositeId: input.compositeUnitId },
    orderBy: { unitId: "asc" },
  });
  if (members.length < 2) {
    throw new Error("CompositeUnit must have at least 2 members");
  }
  return members.map((m) => ({
    physicalUnitId: m.unitId,
    compositeUnitId: input.compositeUnitId,
    startDate: input.startDate,
    endDate: input.endDate,
  }));
}

export { BLOCKING_STATUSES };
