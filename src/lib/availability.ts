import type { PrismaClient, ReservationStatus, ServiceType, UnitKind } from "@prisma/client";
import { eachNight, rangesOverlap, toDateOnly } from "./dates";
import { communicatingRoomsLabel, roomDisplayName } from "./labels";

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
          reason: `Solapa con ${ex.reservation.code} (${ex.reservation.status})`,
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
    const err = new Error(`Habitación no disponible: ${msg}`);
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

export type AvailabilityCandidate = {
  selectionKey: string;
  kind: "unit" | "communicating";
  id: string;
  code: string;
  label: string;
  capacity: number;
  unitKind?: UnitKind;
  attributeIds: string[];
  attributeLabels: string[];
  preferenceHits: number;
  meetsAllPreferences: boolean;
  /** False when softMandatory and room lacks some mandatory tags. */
  meetsMandatory: boolean;
  missingMandatoryLabels: string[];
  capacityOk: boolean;
  commercialCategoryId: string | null;
  memberCodes?: string[];
};

export type ServiceAvailability = {
  serviceType: ServiceType;
  available: boolean;
  suggestedNightlyArs: number | null;
};

export type LiveAvailabilityResult = {
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  hasAvailability: boolean;
  availableCount: number;
  candidates: AvailabilityCandidate[];
  services: ServiceAvailability[];
};

/**
 * List rooms / communicating pairs free for [checkIn, checkOut),
 * filtered by mandatory attributes and ranked by preferences.
 *
 * softMandatory: include rooms that miss mandatory tags (ranked lower,
 * flagged with meetsMandatory=false) — used when converting a consulta
 * so recepción can override with an explicit warning.
 */
export async function listLiveAvailability(
  db: Db,
  input: {
    checkInDate: string;
    checkOutDate: string;
    adults?: number;
    children?: number;
    mandatoryAttributeIds?: string[];
    preferenceAttributeIds?: string[];
    excludeReservationId?: string;
    softMandatory?: boolean;
  },
): Promise<LiveAvailabilityResult> {
  const checkIn = toDateOnly(input.checkInDate);
  const checkOut = toDateOnly(input.checkOutDate);
  if (!(checkIn < checkOut)) {
    throw new Error("La fecha de salida debe ser posterior a la de llegada");
  }
  const nights = eachNight(checkIn, checkOut).length;
  const guests = (input.adults ?? 2) + (input.children ?? 0);
  const mandatoryIds = input.mandatoryAttributeIds ?? [];
  const mandatory = new Set(mandatoryIds);
  const preferences = input.preferenceAttributeIds ?? [];
  const soft = Boolean(input.softMandatory);

  const units = await db.physicalUnit.findMany({
    where: { active: true },
    include: {
      attributes: { include: { attribute: true } },
      commercialCategory: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  const attrLabelById = new Map<string, string>();
  for (const u of units) {
    for (const a of u.attributes) {
      attrLabelById.set(a.attributeId, a.attribute.label);
    }
  }
  // Ensure we have labels even if no unit has the attr
  if (mandatoryIds.length) {
    const attrs = await db.unitAttribute.findMany({
      where: { id: { in: mandatoryIds } },
      select: { id: true, label: true },
    });
    for (const a of attrs) attrLabelById.set(a.id, a.label);
  }

  const composites = await db.compositeUnit.findMany({
    where: { active: true },
    include: {
      members: {
        include: {
          unit: {
            include: { attributes: { include: { attribute: true } } },
          },
        },
      },
    },
    orderBy: { code: "asc" },
  });

  const compCat = await db.commercialCategory.findFirst({
    where: { code: "COMP" },
  });

  const busySegments = await db.assignmentSegment.findMany({
    where: {
      reservation: {
        status: { in: BLOCKING_STATUSES },
        ...(input.excludeReservationId
          ? { id: { not: input.excludeReservationId } }
          : {}),
      },
    },
    select: { physicalUnitId: true, startDate: true, endDate: true },
  });

  const isUnitFree = (unitId: string) =>
    !busySegments.some(
      (s) =>
        s.physicalUnitId === unitId &&
        rangesOverlap(checkIn, checkOut, s.startDate, s.endDate),
    );

  const candidates: AvailabilityCandidate[] = [];

  for (const u of units) {
    if (!isUnitFree(u.id)) continue;
    const attributeIds = u.attributes.map((a) => a.attributeId);
    const missingMandatory = mandatoryIds.filter((id) => !attributeIds.includes(id));
    const meetsMandatory = missingMandatory.length === 0;
    if (!meetsMandatory && !soft) continue;
    const preferenceHits = preferences.filter((id) => attributeIds.includes(id)).length;
    candidates.push({
      selectionKey: `unit:${u.id}`,
      kind: "unit",
      id: u.id,
      code: u.code,
      label: roomDisplayName(u.code, u.name, u.kind),
      capacity: u.capacity,
      unitKind: u.kind,
      attributeIds,
      attributeLabels: u.attributes.map((a) => a.attribute.label),
      preferenceHits,
      meetsAllPreferences:
        preferences.length === 0 || preferenceHits === preferences.length,
      meetsMandatory,
      missingMandatoryLabels: missingMandatory.map(
        (id) => attrLabelById.get(id) ?? id,
      ),
      capacityOk: guests <= u.capacity,
      commercialCategoryId: u.commercialCategoryId,
    });
  }

  for (const c of composites) {
    const memberIds = c.members.map((m) => m.unitId);
    if (memberIds.length < 2) continue;
    if (!memberIds.every(isUnitFree)) continue;
    const attrSet = new Set<string>();
    const attrLabels = new Set<string>();
    let capacity = 0;
    for (const m of c.members) {
      capacity += m.unit.capacity;
      for (const a of m.unit.attributes) {
        attrSet.add(a.attributeId);
        attrLabels.add(a.attribute.label);
      }
    }
    const attributeIds = [...attrSet];
    const missingMandatory = mandatoryIds.filter((id) => !attributeIds.includes(id));
    const meetsMandatory = missingMandatory.length === 0;
    if (!meetsMandatory && !soft) continue;
    const preferenceHits = preferences.filter((id) => attributeIds.includes(id)).length;
    const firstMember = units.find((u) => u.id === c.members[0]?.unitId);
    candidates.push({
      selectionKey: `communicating:${c.id}`,
      kind: "communicating",
      id: c.id,
      code: c.code,
      label: communicatingRoomsLabel(c.code, c.name),
      capacity,
      attributeIds,
      attributeLabels: [...attrLabels],
      preferenceHits,
      meetsAllPreferences:
        preferences.length === 0 || preferenceHits === preferences.length,
      meetsMandatory,
      missingMandatoryLabels: missingMandatory.map(
        (id) => attrLabelById.get(id) ?? id,
      ),
      capacityOk: guests <= capacity,
      commercialCategoryId: compCat?.id ?? firstMember?.commercialCategoryId ?? null,
      memberCodes: c.members.map((m) => m.unit.code),
    });
  }

  candidates.sort((a, b) => {
    if (a.meetsMandatory !== b.meetsMandatory) return a.meetsMandatory ? -1 : 1;
    if (b.preferenceHits !== a.preferenceHits) return b.preferenceHits - a.preferenceHits;
    if (a.capacityOk !== b.capacityOk) return a.capacityOk ? -1 : 1;
    return a.code.localeCompare(b.code, undefined, { numeric: true });
  });

  const matchingCount = candidates.filter((c) => c.meetsMandatory).length;
  const services = await listServiceAvailability(db, checkIn, checkOut);

  return {
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    nights,
    hasAvailability: soft ? candidates.length > 0 : matchingCount > 0,
    availableCount: soft ? matchingCount : candidates.length,
    candidates,
    services,
  };
}

/** A service type is “available” if there is rate coverage for every night. */
export async function listServiceAvailability(
  db: Db,
  checkIn: Date,
  checkOut: Date,
): Promise<ServiceAvailability[]> {
  const nights = eachNight(checkIn, checkOut);
  const serviceTypes: ServiceType[] = ["SIN_DESAYUNO", "DESAYUNO", "MEDIA_PENSION"];
  const plans = await db.ratePlan.findMany({
    where: { active: true },
    include: { rates: true },
  });

  return serviceTypes.map((serviceType) => {
    const matching = plans.filter((p) => p.serviceType === serviceType);
    let available = nights.length > 0;
    let suggestedNightlyArs: number | null = null;
    for (const night of nights) {
      const covering = matching.flatMap((p) =>
        p.rates.filter((r) => r.validFrom <= night && night <= r.validTo),
      );
      if (covering.length === 0) {
        available = false;
        break;
      }
      const amounts = covering.map((r) => Number(r.amountArs));
      const min = Math.min(...amounts);
      suggestedNightlyArs =
        suggestedNightlyArs == null ? min : Math.min(suggestedNightlyArs, min);
    }
    if (!available) suggestedNightlyArs = null;
    return { serviceType, available, suggestedNightlyArs };
  });
}

export async function suggestPriceArs(
  db: Db,
  input: {
    commercialCategoryId: string | null;
    serviceType: ServiceType;
    checkInDate: string;
    checkOutDate: string;
  },
): Promise<number | null> {
  if (!input.commercialCategoryId) return null;
  const nights = eachNight(toDateOnly(input.checkInDate), toDateOnly(input.checkOutDate));
  if (nights.length === 0) return null;
  const plan = await db.ratePlan.findFirst({
    where: {
      active: true,
      commercialCategoryId: input.commercialCategoryId,
      serviceType: input.serviceType,
    },
    include: { rates: true },
  });
  if (!plan) return null;
  let total = 0;
  for (const night of nights) {
    const rate = plan.rates.find((r) => r.validFrom <= night && night <= r.validTo);
    if (!rate) return null;
    total += Number(rate.amountArs);
  }
  return total;
}
