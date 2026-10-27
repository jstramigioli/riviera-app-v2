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
import { toDateOnly } from "@/lib/dates";
import { writeAudit } from "@/lib/audit";

export async function createReservationAction(formData: FormData) {
  const user = await requireUser();
  const physicalUnitId = String(formData.get("physicalUnitId") || "") || undefined;
  const compositeUnitId = String(formData.get("compositeUnitId") || "") || undefined;
  const extra = String(formData.get("extraUnitIds") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const reservation = await createReservation({
      physicalUnitId,
      compositeUnitId,
      extraUnitIds: extra.length ? extra : undefined,
      groupName: String(formData.get("groupName") || "") || undefined,
      checkInDate: String(formData.get("checkInDate")),
      checkOutDate: String(formData.get("checkOutDate")),
      status: (String(formData.get("status") || "CONSULTA") as ReservationStatus),
      channel: String(formData.get("channel") || "") || undefined,
      doNotMove: formData.get("doNotMove") === "on",
      requirements: String(formData.get("requirements") || "") || undefined,
      preferences: String(formData.get("preferences") || "") || undefined,
      notes: String(formData.get("notes") || "") || undefined,
      adults: Number(formData.get("adults") || 2),
      children: Number(formData.get("children") || 0),
      serviceType: (String(formData.get("serviceType") || "DESAYUNO") as ServiceType),
      agreedPriceArs: formData.get("agreedPriceArs")
        ? Number(formData.get("agreedPriceArs"))
        : null,
      freezePrice: formData.get("freezePrice") === "on",
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
  });
  revalidatePath(`/reservas/${reservationId}`);
  revalidatePath("/calendario");
  redirect(`/reservas/${reservationId}`);
}
