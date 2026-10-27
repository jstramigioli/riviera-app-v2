"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

/** Toggle habitación fijada (roomLocked) ↔ asignación flexible. */
export async function setRoomLockedAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const roomLocked = formData.get("roomLocked") === "on" || formData.get("roomLocked") === "true";
  const current = await prisma.reservation.findUniqueOrThrow({ where: { id } });
  if (current.status === "IN_HOUSE" && !roomLocked && user.role !== "ADMIN") {
    redirect(
      `/reservas/${id}?error=${encodeURIComponent(
        "Con huésped en casa, solo administración puede desfijar la habitación.",
      )}`,
    );
  }
  await prisma.reservation.update({
    where: { id },
    data: { doNotMove: roomLocked },
  });
  await writeAudit({
    userId: user.id,
    action: "reservation.room_locked",
    entityType: "Reservation",
    entityId: id,
    before: { doNotMove: current.doNotMove },
    after: { doNotMove: roomLocked },
  });
  revalidatePath(`/reservas/${id}`);
  revalidatePath("/calendario");
  redirect(`/reservas/${id}`);
}
