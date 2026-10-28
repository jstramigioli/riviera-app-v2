import type { Prisma, ReservationStatus, ServiceType } from "@prisma/client";
import { prisma } from "./db";
import { assertAvailable, expandCompositeSegments, type SegmentInput } from "./availability";
import { toDateOnly } from "./dates";
import { writeAudit } from "./audit";
import { derivePaymentStatus } from "./status";
import { balanceArs, netPaymentsArs, toDecimal } from "./money";

async function nextReservationCode(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.reservation.count();
  return `RIV-${year}-${String(count + 1).padStart(4, "0")}`;
}

export type StructuredRequirementInput = {
  attributeId: string;
  /** Always DESIRED in MVP (D-02). */
  kind?: "DESIRED";
};

export type CreateReservationInput = {
  status?: ReservationStatus;
  channel?: string;
  doNotMove?: boolean;
  requirements?: string;
  preferences?: string;
  notes?: string;
  structuredRequirements?: StructuredRequirementInput[];
  checkInDate: string;
  checkOutDate: string;
  adults?: number;
  children?: number;
  serviceType?: ServiceType;
  agreedPriceArs?: number | null;
  freezePrice?: boolean;
  physicalUnitId?: string;
  compositeUnitId?: string;
  groupId?: string;
  groupName?: string;
  extraUnitIds?: string[];
  userId?: string;
  /**
   * When true, room may miss desired tags (reception override with note).
   * Tags never hard-block; this flag is for audit / requiring a note upstream.
   */
  allowDesiredOverride?: boolean;
  /** @deprecated alias of allowDesiredOverride */
  allowMandatoryOverride?: boolean;
};

export async function createReservation(input: CreateReservationInput) {
  const checkIn = toDateOnly(input.checkInDate);
  const checkOut = toDateOnly(input.checkOutDate);
  if (!(checkIn < checkOut)) throw new Error("Checkout debe ser posterior al check-in");

  let segments: SegmentInput[] = [];

  if (input.compositeUnitId) {
    segments = await expandCompositeSegments(prisma, {
      compositeUnitId: input.compositeUnitId,
      startDate: checkIn,
      endDate: checkOut,
    });
  } else if (input.physicalUnitId) {
    segments = [
      {
        physicalUnitId: input.physicalUnitId,
        startDate: checkIn,
        endDate: checkOut,
      },
    ];
  } else {
    throw new Error("Elegí una habitación (o habitaciones comunicadas) disponible");
  }

  if (input.extraUnitIds?.length) {
    for (const uid of input.extraUnitIds) {
      segments.push({
        physicalUnitId: uid,
        startDate: checkIn,
        endDate: checkOut,
      });
    }
  }

  const structured = dedupeRequirements(input.structuredRequirements ?? []);
  const desiredIds = structured.map((r) => r.attributeId);
  const override =
    Boolean(input.allowDesiredOverride) || Boolean(input.allowMandatoryOverride);

  // D-02: tags deseados no bloquean. Si faltan y no hay override explícito → error
  // para forzar advertencia + motivo en UI (recepción override).
  if (desiredIds.length && !override) {
    const missing = await missingDesiredAttributes(prisma, segments, desiredIds);
    if (missing.length) {
      throw new Error(
        "La habitación elegida no cumple las características deseadas. Confirmá el override con un motivo.",
      );
    }
  }

  const status = input.status ?? "PRERRESERVA";
  if (status === "CONSULTA") {
    throw new Error(
      "Las consultas van en la sección Consultas (sin habitación). Acá creá prerreserva o reserva.",
    );
  }
  const blocking = status !== "CANCELADA" && status !== "FINALIZADA";
  if (blocking) {
    await assertAvailable(prisma, segments);
  }

  const code = await nextReservationCode();
  const freeze = Boolean(input.freezePrice || status === "CONFIRMADA" || status === "IN_HOUSE");

  const result = await prisma.$transaction(async (tx) => {
    let groupId = input.groupId ?? null;
    if (!groupId && input.extraUnitIds?.length) {
      const g = await tx.reservationGroup.create({
        data: { name: input.groupName ?? `Grupo ${code}` },
      });
      groupId = g.id;
    }

    const reservation = await tx.reservation.create({
      data: {
        code,
        status,
        channel: input.channel,
        doNotMove: input.doNotMove ?? false,
        requirements: input.requirements,
        preferences: input.preferences,
        notes: input.notes,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        adults: input.adults ?? 2,
        children: input.children ?? 0,
        serviceType: input.serviceType ?? "DESAYUNO",
        agreedPriceArs: input.agreedPriceArs != null ? toDecimal(input.agreedPriceArs) : null,
        priceFrozen: freeze,
        groupId,
        segments: {
          create: segments.map((s, i) => ({
            physicalUnitId: s.physicalUnitId,
            compositeUnitId: s.compositeUnitId ?? null,
            startDate: toDateOnly(s.startDate),
            endDate: toDateOnly(s.endDate),
            sortOrder: i,
          })),
        },
        structuredReqs: structured.length
          ? {
              create: structured.map((r) => ({
                attributeId: r.attributeId,
                kind: "DESIRED" as const,
              })),
            }
          : undefined,
      },
      include: { segments: true, payments: true, guests: true, structuredReqs: true },
    });
    return reservation;
  });

  await writeAudit({
    userId: input.userId,
    action: "reservation.create",
    entityType: "Reservation",
    entityId: result.id,
    after: { code: result.code, status: result.status, desiredOverride: override },
  });

  return result;
}

export async function updateReservationStatus(
  id: string,
  status: ReservationStatus,
  userId?: string,
) {
  const current = await prisma.reservation.findUniqueOrThrow({
    where: { id },
    include: { segments: true },
  });

  const blocking =
    status === "PRERRESERVA" || status === "CONFIRMADA" || status === "IN_HOUSE";
  if (blocking && current.status !== status) {
    await assertAvailable(
      prisma,
      current.segments.map((s) => ({
        physicalUnitId: s.physicalUnitId,
        compositeUnitId: s.compositeUnitId,
        startDate: s.startDate,
        endDate: s.endDate,
      })),
      { excludeReservationId: id },
    );
  }

  const data: Prisma.ReservationUpdateInput = {
    status,
    cancelledAt: status === "CANCELADA" ? new Date() : current.cancelledAt,
  };
  if (
    (status === "CONFIRMADA" || status === "IN_HOUSE") &&
    !current.priceFrozen &&
    current.agreedPriceArs != null
  ) {
    data.priceFrozen = true;
  }

  const updated = await prisma.reservation.update({ where: { id }, data });
  await writeAudit({
    userId,
    action: "reservation.status",
    entityType: "Reservation",
    entityId: id,
    before: { status: current.status },
    after: { status },
  });
  return updated;
}

export async function setAgreedPrice(
  id: string,
  amountArs: number,
  note: string | undefined,
  userId?: string,
) {
  const current = await prisma.reservation.findUniqueOrThrow({
    where: { id },
    include: { payments: true },
  });
  if (current.priceFrozen && current.agreedPriceArs != null) {
    // Override still allowed but audited
  }
  const net = Number(netPaymentsArs(current.payments));
  const paymentStatus = derivePaymentStatus(amountArs, net);
  const updated = await prisma.reservation.update({
    where: { id },
    data: {
      agreedPriceArs: toDecimal(amountArs),
      priceOverrideNote: note,
      paymentStatus,
      priceFrozen:
        current.status === "CONFIRMADA" ||
        current.status === "IN_HOUSE" ||
        current.priceFrozen,
    },
  });
  await writeAudit({
    userId,
    action: "reservation.price_override",
    entityType: "Reservation",
    entityId: id,
    before: { agreedPriceArs: current.agreedPriceArs },
    after: { agreedPriceArs: amountArs, note },
  });
  return updated;
}

export async function refreshPaymentStatus(reservationId: string) {
  const r = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: { payments: true },
  });
  const agreed = r.agreedPriceArs != null ? Number(r.agreedPriceArs) : null;
  const net = Number(netPaymentsArs(r.payments));
  const paymentStatus = derivePaymentStatus(agreed, net);
  return prisma.reservation.update({
    where: { id: reservationId },
    data: { paymentStatus },
  });
}

export async function getReservationBalance(reservationId: string) {
  const r = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: { payments: true },
  });
  return balanceArs(r.agreedPriceArs, r.payments);
}

function dedupeRequirements(
  items: StructuredRequirementInput[],
): StructuredRequirementInput[] {
  const map = new Map<string, StructuredRequirementInput>();
  for (const item of items) {
    map.set(item.attributeId, { attributeId: item.attributeId, kind: "DESIRED" });
  }
  return [...map.values()];
}

async function missingDesiredAttributes(
  db: typeof prisma,
  segments: SegmentInput[],
  desiredIds: string[],
): Promise<string[]> {
  const unitIds = [...new Set(segments.map((s) => s.physicalUnitId))];
  const links = await db.unitAttributeLink.findMany({
    where: { unitId: { in: unitIds } },
    select: { unitId: true, attributeId: true },
  });
  const byUnit = new Map<string, Set<string>>();
  for (const l of links) {
    if (!byUnit.has(l.unitId)) byUnit.set(l.unitId, new Set());
    byUnit.get(l.unitId)!.add(l.attributeId);
  }

  const compositeIds = [
    ...new Set(segments.map((s) => s.compositeUnitId).filter(Boolean) as string[]),
  ];
  if (compositeIds.length) {
    const missingAll: string[] = [];
    for (const cid of compositeIds) {
      const memberSegs = segments.filter((s) => s.compositeUnitId === cid);
      const union = new Set<string>();
      for (const s of memberSegs) {
        for (const a of byUnit.get(s.physicalUnitId) ?? []) union.add(a);
      }
      missingAll.push(...desiredIds.filter((id) => !union.has(id)));
    }
    return [...new Set(missingAll)];
  }

  const missing: string[] = [];
  for (const uid of unitIds) {
    const have = byUnit.get(uid) ?? new Set();
    for (const id of desiredIds) {
      if (!have.has(id)) missing.push(id);
    }
  }
  return [...new Set(missing)];
}
