import type { QueryStatus, RequirementKind, ReservationStatus, ServiceType } from "@prisma/client";
import { prisma } from "./db";
import { toDateOnly } from "./dates";
import { writeAudit } from "./audit";
import {
  createReservation,
  type StructuredRequirementInput,
} from "./reservations";

export type QueryRequirementInput = StructuredRequirementInput;

export type UpsertQueryInput = {
  id?: string;
  channel?: string | null;
  notes?: string | null;
  checkInDate: string;
  checkOutDate: string;
  adults?: number;
  children?: number;
  serviceType?: ServiceType;
  guestFirstName?: string | null;
  guestLastName?: string | null;
  guestPhone?: string | null;
  guestEmail?: string | null;
  guestDocumentNumber?: string | null;
  guestId?: string | null;
  structuredRequirements?: QueryRequirementInput[];
  userId?: string;
};

async function nextQueryCode(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.query.count();
  return `CON-${year}-${String(count + 1).padStart(4, "0")}`;
}

function dedupeRequirements(
  items: QueryRequirementInput[],
): QueryRequirementInput[] {
  const map = new Map<string, QueryRequirementInput>();
  for (const item of items) {
    const prev = map.get(item.attributeId);
    if (!prev || item.kind === "MANDATORY") map.set(item.attributeId, item);
  }
  return [...map.values()];
}

/** Autosave / create draft: requires dates; guest name recommended but not mandatory for draft. */
export async function upsertQueryDraft(input: UpsertQueryInput) {
  const checkIn = toDateOnly(input.checkInDate);
  const checkOut = toDateOnly(input.checkOutDate);
  if (!(checkIn < checkOut)) {
    throw new Error("La fecha de salida debe ser posterior a la de llegada");
  }

  const structured = dedupeRequirements(input.structuredRequirements ?? []);
  const data = {
    channel: input.channel || null,
    notes: input.notes || null,
    checkInDate: checkIn,
    checkOutDate: checkOut,
    adults: input.adults ?? 2,
    children: input.children ?? 0,
    serviceType: input.serviceType ?? ("DESAYUNO" as ServiceType),
    guestFirstName: input.guestFirstName?.trim() || null,
    guestLastName: input.guestLastName?.trim() || null,
    guestPhone: input.guestPhone?.trim() || null,
    guestEmail: input.guestEmail?.trim() || null,
    guestDocumentNumber: input.guestDocumentNumber?.trim() || null,
    guestId: input.guestId || null,
  };

  if (input.id) {
    const existing = await prisma.query.findUniqueOrThrow({ where: { id: input.id } });
    if (existing.status !== "OPEN") {
      throw new Error("Solo se pueden editar consultas abiertas");
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.queryRequirement.deleteMany({ where: { queryId: input.id } });
      return tx.query.update({
        where: { id: input.id },
        data: {
          ...data,
          structuredReqs: structured.length
            ? {
                create: structured.map((r) => ({
                  attributeId: r.attributeId,
                  kind: r.kind,
                })),
              }
            : undefined,
        },
        include: { structuredReqs: { include: { attribute: true } }, guest: true },
      });
    });
    return updated;
  }

  const code = await nextQueryCode();
  const created = await prisma.query.create({
    data: {
      code,
      status: "OPEN",
      ...data,
      structuredReqs: structured.length
        ? {
            create: structured.map((r) => ({
              attributeId: r.attributeId,
              kind: r.kind,
            })),
          }
        : undefined,
    },
    include: { structuredReqs: { include: { attribute: true } }, guest: true },
  });

  await writeAudit({
    userId: input.userId,
    action: "query.create",
    entityType: "Query",
    entityId: created.id,
    after: { code: created.code },
  });

  return created;
}

export async function listOpenQueries(take = 100) {
  return prisma.query.findMany({
    where: { status: "OPEN" },
    orderBy: [{ checkInDate: "asc" }, { updatedAt: "desc" }],
    take,
    include: {
      structuredReqs: { include: { attribute: true } },
      guest: true,
    },
  });
}

export async function getQuery(id: string) {
  return prisma.query.findUnique({
    where: { id },
    include: {
      structuredReqs: { include: { attribute: true } },
      guest: true,
      convertedReservation: { select: { id: true, code: true, status: true } },
    },
  });
}

export async function deleteQuery(id: string, userId?: string) {
  const q = await prisma.query.findUniqueOrThrow({ where: { id } });
  if (q.status === "CONVERTED") {
    throw new Error("No se puede eliminar una consulta ya convertida");
  }
  await prisma.query.delete({ where: { id } });
  await writeAudit({
    userId,
    action: "query.delete",
    entityType: "Query",
    entityId: id,
    before: { code: q.code, status: q.status },
  });
}

export async function archiveQuery(id: string, userId?: string) {
  const q = await prisma.query.update({
    where: { id },
    data: { status: "ARCHIVED" satisfies QueryStatus },
  });
  await writeAudit({
    userId,
    action: "query.archive",
    entityType: "Query",
    entityId: id,
    after: { status: "ARCHIVED" },
  });
  return q;
}

export type ConvertQueryInput = {
  queryId: string;
  physicalUnitId?: string;
  compositeUnitId?: string;
  status?: Extract<ReservationStatus, "PRERRESERVA" | "CONFIRMADA">;
  agreedPriceArs?: number | null;
  roomLocked?: boolean;
  allowMandatoryOverride?: boolean;
  overrideNote?: string;
  userId?: string;
};

/**
 * Convert consulta → prerreserva/reserva with a concrete room.
 * Never leaves the resulting reservation without AssignmentSegment.
 */
export async function convertQueryToReservation(input: ConvertQueryInput) {
  const query = await prisma.query.findUniqueOrThrow({
    where: { id: input.queryId },
    include: { structuredReqs: true, guest: true },
  });
  if (query.status !== "OPEN") {
    throw new Error("La consulta ya no está abierta");
  }
  if (!input.physicalUnitId && !input.compositeUnitId) {
    throw new Error("Elegí una habitación para convertir la consulta en reserva");
  }

  const structured: StructuredRequirementInput[] = query.structuredReqs.map((r) => ({
    attributeId: r.attributeId,
    kind: r.kind as RequirementKind,
  }));

  if (input.allowMandatoryOverride && !input.overrideNote?.trim()) {
    throw new Error(
      "Para asignar una habitación que no cumple lo pedido, indicá el motivo",
    );
  }

  const guestFirst =
    query.guestFirstName || query.guest?.firstName || null;
  const guestLast =
    query.guestLastName || query.guest?.lastName || null;

  const reservation = await createReservation({
    physicalUnitId: input.physicalUnitId,
    compositeUnitId: input.compositeUnitId,
    checkInDate: query.checkInDate.toISOString().slice(0, 10),
    checkOutDate: query.checkOutDate.toISOString().slice(0, 10),
    status: input.status ?? "PRERRESERVA",
    channel: query.channel ?? undefined,
    notes: [
      query.notes,
      input.allowMandatoryOverride && input.overrideNote
        ? `Override características: ${input.overrideNote}`
        : null,
    ]
      .filter(Boolean)
      .join("\n") || undefined,
    structuredRequirements: structured,
    adults: query.adults,
    children: query.children,
    serviceType: query.serviceType,
    agreedPriceArs: input.agreedPriceArs ?? null,
    doNotMove: input.roomLocked ?? false,
    allowMandatoryOverride: input.allowMandatoryOverride,
    userId: input.userId,
  });

  let guestId = query.guestId;
  if (!guestId && guestFirst && guestLast) {
    const guest = await prisma.guest.create({
      data: {
        firstName: guestFirst,
        lastName: guestLast,
        phone: query.guestPhone,
        email: query.guestEmail,
        documentNumber: query.guestDocumentNumber,
      },
    });
    guestId = guest.id;
  }
  if (guestId) {
    await prisma.reservationGuest.create({
      data: { reservationId: reservation.id, guestId, role: "TITULAR" },
    });
  }

  await prisma.query.update({
    where: { id: query.id },
    data: {
      status: "CONVERTED",
      convertedReservationId: reservation.id,
      guestId: guestId ?? query.guestId,
    },
  });

  await writeAudit({
    userId: input.userId,
    action: "query.convert",
    entityType: "Query",
    entityId: query.id,
    after: {
      reservationId: reservation.id,
      reservationCode: reservation.code,
      allowMandatoryOverride: Boolean(input.allowMandatoryOverride),
    },
  });

  return reservation;
}
