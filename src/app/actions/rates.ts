"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ServiceType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toDateOnly } from "@/lib/dates";
import { toDecimal } from "@/lib/money";
import { writeAudit } from "@/lib/audit";

export async function createRatePlanAction(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const plan = await prisma.ratePlan.create({
    data: {
      name: String(formData.get("name")),
      commercialCategoryId: String(formData.get("commercialCategoryId")),
      serviceType: String(formData.get("serviceType")) as ServiceType,
    },
  });
  await writeAudit({
    userId: user.id,
    action: "rate.plan_create",
    entityType: "RatePlan",
    entityId: plan.id,
  });
  revalidatePath("/tarifas");
  redirect("/tarifas");
}

export async function createRateAction(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const rate = await prisma.rate.create({
    data: {
      ratePlanId: String(formData.get("ratePlanId")),
      validFrom: toDateOnly(String(formData.get("validFrom"))),
      validTo: toDateOnly(String(formData.get("validTo"))),
      amountArs: toDecimal(Number(formData.get("amountArs"))),
    },
  });
  await writeAudit({
    userId: user.id,
    action: "rate.create",
    entityType: "Rate",
    entityId: rate.id,
  });
  revalidatePath("/tarifas");
  redirect("/tarifas");
}
