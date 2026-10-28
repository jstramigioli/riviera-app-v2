"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toDateOnly } from "@/lib/dates";
import { writeAudit } from "@/lib/audit";

export async function createOpenPeriodAction(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const name = String(formData.get("name") || "").trim();
  const openFrom = String(formData.get("openFrom") || "");
  const openTo = String(formData.get("openTo") || "");
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!name || !openFrom || !openTo) {
    throw new Error("Nombre y fechas son obligatorios");
  }
  const from = toDateOnly(openFrom);
  const to = toDateOnly(openTo);
  if (!(from <= to)) {
    throw new Error("La fecha hasta debe ser posterior o igual a desde");
  }

  const created = await prisma.hotelOpenPeriod.create({
    data: { name, openFrom: from, openTo: to, notes, active: true },
  });
  await writeAudit({
    userId: user.id,
    action: "hotel_open_period.create",
    entityType: "HotelOpenPeriod",
    entityId: created.id,
    after: created,
  });
  revalidatePath("/admin");
  revalidatePath("/calendario");
}

export async function deactivateOpenPeriodAction(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Falta id");
  const updated = await prisma.hotelOpenPeriod.update({
    where: { id },
    data: { active: false },
  });
  await writeAudit({
    userId: user.id,
    action: "hotel_open_period.deactivate",
    entityType: "HotelOpenPeriod",
    entityId: id,
    after: updated,
  });
  revalidatePath("/admin");
  revalidatePath("/calendario");
}
