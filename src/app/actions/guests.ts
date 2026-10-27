"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { GuestRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export async function createGuestAction(formData: FormData) {
  await requireUser();
  const guest = await prisma.guest.create({
    data: {
      firstName: String(formData.get("firstName")),
      lastName: String(formData.get("lastName")),
      documentType: String(formData.get("documentType") || "") || null,
      documentNumber: String(formData.get("documentNumber") || "") || null,
      email: String(formData.get("email") || "") || null,
      phone: String(formData.get("phone") || "") || null,
      nationality: String(formData.get("nationality") || "") || null,
      notes: String(formData.get("notes") || "") || null,
    },
  });
  revalidatePath("/huespedes");
  redirect(`/huespedes/${guest.id}`);
}

export async function linkGuestAction(formData: FormData) {
  const user = await requireUser();
  const reservationId = String(formData.get("reservationId"));
  const guestId = String(formData.get("guestId"));
  const role = (String(formData.get("role") || "ACOMPANANTE") as GuestRole);
  await prisma.reservationGuest.upsert({
    where: { reservationId_guestId: { reservationId, guestId } },
    update: { role },
    create: { reservationId, guestId, role },
  });
  await writeAudit({
    userId: user.id,
    action: "reservation.link_guest",
    entityType: "Reservation",
    entityId: reservationId,
    after: { guestId, role },
  });
  revalidatePath(`/reservas/${reservationId}`);
  redirect(`/reservas/${reservationId}`);
}
