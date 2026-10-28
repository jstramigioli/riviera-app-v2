"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ReservationStatus, ServiceType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import {
  createReservation,
  setAgreedPrice,
  updateReservationStatus,
} from "@/lib/reservations";
import { prisma } from "@/lib/db";
import { assertAvailable } from "@/lib/availability";
import { isoDate, toDateOnly } from "@/lib/dates";
import { writeAudit } from "@/lib/audit";
import { suggestPriceArs } from "@/lib/rates";
import { formatArs } from "@/lib/money";

export async function createReservationAction(formData: FormData) {
  const user = await requireUser();
  const physicalUnitId = String(formData.get("physicalUnitId") || "") || undefined;
  const compositeUnitId = String(formData.get("compositeUnitId") || "") || undefined;
  const extra = String(formData.get("extraUnitIds") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const desired = [
    ...new Set(
      [
        ...String(formData.get("desiredAttributeIds") || "").split(","),
        ...String(formData.get("mandatoryAttributeIds") || "").split(","),
        ...String(formData.get("preferenceAttributeIds") || "").split(","),
      ]
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];

  const structuredRequirements = desired.map((attributeId) => ({
    attributeId,
    kind: "DESIRED" as const,
  }));

  const allowOverride =
    formData.get("allowDesiredOverride") === "on" ||
    formData.get("allowDesiredOverride") === "true" ||
    formData.get("allowDesiredOverride") === "1" ||
    formData.get("allowMandatoryOverride") === "on";
  const overrideNote = String(formData.get("overrideNote") || "").trim();

  try {
    if (!physicalUnitId && !compositeUnitId) {
      throw new Error("Elegí una habitación disponible para esas fechas");
    }
    if (allowOverride && !overrideNote) {
      throw new Error(
        "Para asignar una habitación que no cumple lo pedido, indicá el motivo",
      );
    }

    const baseNotes = String(formData.get("notes") || "") || undefined;
    const notes = [
      baseNotes,
      allowOverride && overrideNote
        ? `Override características deseadas: ${overrideNote}`
        : null,
    ]
      .filter(Boolean)
      .join("\n") || undefined;

    const reservation = await createReservation({
      physicalUnitId,
      compositeUnitId,
      extraUnitIds: extra.length ? extra : undefined,
      groupName: String(formData.get("groupName") || "") || undefined,
      checkInDate: String(formData.get("checkInDate")),
      checkOutDate: String(formData.get("checkOutDate")),
      status: (String(formData.get("status") || "PRERRESERVA") as ReservationStatus),
      channel: String(formData.get("channel") || "") || undefined,
      doNotMove: formData.get("doNotMove") === "on",
      notes,
      structuredRequirements,
      adults: Number(formData.get("adults") || 2),
      children: Number(formData.get("children") || 0),
      serviceType: (String(formData.get("serviceType") || "DESAYUNO") as ServiceType),
      agreedPriceArs: formData.get("agreedPriceArs")
        ? Number(formData.get("agreedPriceArs"))
        : null,
      freezePrice: formData.get("freezePrice") === "on",
      allowDesiredOverride: allowOverride,
      userId: user.id,
    });

    const guestFirst = String(formData.get("guestFirstName") || "").trim();
    const guestLast = String(formData.get("guestLastName") || "").trim();
    if (guestFirst && guestLast) {
      const guest = await prisma.guest.create({
        data: {
          firstName: guestFirst,
          lastName: guestLast,
          documentType: String(formData.get("documentType") || "") || null,
          documentNumber: String(formData.get("documentNumber") || "") || null,
          phone: String(formData.get("phone") || "") || null,
          email: String(formData.get("email") || "") || null,
        },
      });
      await prisma.reservationGuest.create({
        data: { reservationId: reservation.id, guestId: guest.id, role: "TITULAR" },
      });
    }

    revalidatePath("/calendario");
    redirect(`/reservas/${reservation.id}`);
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "digest" in e &&
      typeof (e as { digest: unknown }).digest === "string" &&
      (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw e;
    }
    const msg = e instanceof Error ? e.message : "Error al crear reserva";
    redirect(`/reservas/nueva?error=${encodeURIComponent(msg)}`);
  }
}

export async function updateStatusAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as ReservationStatus;
  await updateReservationStatus(id, status, user.id);
  revalidatePath(`/reservas/${id}`);
  revalidatePath("/calendario");
  revalidatePath("/operacion");
  redirect(`/reservas/${id}`);
}

export async function setPriceAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const amount = Number(formData.get("agreedPriceArs"));
  const note = String(formData.get("priceOverrideNote") || "") || undefined;
  await setAgreedPrice(id, amount, note, user.id);
  revalidatePath(`/reservas/${id}`);
  redirect(`/reservas/${id}`);
}

/** Asigna el precio acordado desde tarifas cargadas (categoría × servicio × noches). */
export async function assignSuggestedTariffAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const reservation = await prisma.reservation.findUniqueOrThrow({
    where: { id },
    include: {
      segments: {
        include: { physicalUnit: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  const categoryId =
    reservation.segments[0]?.physicalUnit.commercialCategoryId ?? null;
  if (!categoryId) {
    redirect(
      `/reservas/${id}?error=${encodeURIComponent(
        "Esta habitación no tiene categoría comercial. Asignala en Inventario para calcular la tarifa.",
      )}`,
    );
  }

  const total = await suggestPriceArs(prisma, {
    commercialCategoryId: categoryId,
    serviceType: reservation.serviceType,
    checkInDate: isoDate(reservation.checkInDate),
    checkOutDate: isoDate(reservation.checkOutDate),
  });

  if (total == null) {
    redirect(
      `/reservas/${id}?error=${encodeURIComponent(
        "No hay tarifas cargadas para todas las noches de esta estadía (categoría y servicio). Revisá Temporadas / Tarifas.",
      )}`,
    );
  }

  await setAgreedPrice(
    id,
    total,
    `Tarifa calculada automáticamente (${formatArs(total)}) según precios cargados`,
    user.id,
  );
  revalidatePath(`/reservas/${id}`);
  revalidatePath("/calendario");
  redirect(`/reservas/${id}`);
}

export async function addSegmentAction(formData: FormData) {
  const user = await requireUser();
  const reservationId = String(formData.get("reservationId"));
  const physicalUnitId = String(formData.get("physicalUnitId"));
  const startDate = toDateOnly(String(formData.get("startDate")));
  const endDate = toDateOnly(String(formData.get("endDate")));

  const reservation = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
  });
  if (["CANCELADA", "FINALIZADA"].includes(reservation.status)) {
    throw new Error("No se pueden agregar tramos a esta reserva");
  }
  if (reservation.doNotMove && user.role !== "ADMIN") {
    redirect(
      `/reservas/${reservationId}?error=${encodeURIComponent(
        "Esta reserva está marcada como «no mover». Solo administración puede cambiar habitación.",
      )}`,
    );
  }

  await assertAvailable(
    prisma,
    [{ physicalUnitId, startDate, endDate }],
    { excludeReservationId: reservationId },
  );

  await prisma.assignmentSegment.create({
    data: { reservationId, physicalUnitId, startDate, endDate },
  });
  await writeAudit({
    userId: user.id,
    action: "reservation.add_segment",
    entityType: "Reservation",
    entityId: reservationId,
    after: { physicalUnitId, startDate, endDate },
    meta: reservation.doNotMove ? { doNotMoveWarned: true } : undefined,
  });
  revalidatePath(`/reservas/${reservationId}`);
  revalidatePath("/calendario");
  redirect(`/reservas/${reservationId}`);
}
