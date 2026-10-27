"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { UnitKind } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export async function upsertUnitAction(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const code = String(formData.get("code"));
  const data = {
    name: String(formData.get("name")),
    capacity: Number(formData.get("capacity") || 2),
    kind: String(formData.get("kind") || "HABITACION") as UnitKind,
    commercialCategoryId: String(formData.get("commercialCategoryId") || "") || null,
    sortOrder: Number(formData.get("sortOrder") || 0),
  };
  const unit = await prisma.physicalUnit.upsert({
    where: { code },
    update: data,
    create: { code, ...data },
  });
  await writeAudit({
    userId: user.id,
    action: "inventory.unit_upsert",
    entityType: "PhysicalUnit",
    entityId: unit.id,
    after: { code, ...data },
  });
  revalidatePath("/inventario");
  redirect("/inventario");
}

export async function upsertCategoryAction(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const code = String(formData.get("code"));
  const name = String(formData.get("name"));
  const cat = await prisma.commercialCategory.upsert({
    where: { code },
    update: { name },
    create: { code, name },
  });
  await writeAudit({
    userId: user.id,
    action: "inventory.category_upsert",
    entityType: "CommercialCategory",
    entityId: cat.id,
    after: { code, name },
  });
  revalidatePath("/inventario");
  redirect("/inventario");
}

export async function upsertAttributeAction(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const key = String(formData.get("key"));
  const label = String(formData.get("label"));
  const attr = await prisma.unitAttribute.upsert({
    where: { key },
    update: { label },
    create: { key, label },
  });
  await writeAudit({
    userId: user.id,
    action: "inventory.attribute_upsert",
    entityType: "UnitAttribute",
    entityId: attr.id,
    after: { key, label },
  });
  revalidatePath("/inventario");
  redirect("/inventario");
}
