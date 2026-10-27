"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { updateReservationStatus } from "@/lib/reservations";

export async function checkInAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  await updateReservationStatus(id, "IN_HOUSE", user.id);
  revalidatePath("/operacion");
  revalidatePath("/calendario");
  revalidatePath(`/reservas/${id}`);
  redirect("/operacion");
}

export async function checkOutAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  await updateReservationStatus(id, "FINALIZADA", user.id);
  revalidatePath("/operacion");
  revalidatePath("/calendario");
  revalidatePath(`/reservas/${id}`);
  redirect("/operacion");
}
