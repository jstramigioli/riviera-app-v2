"use server";

import { revalidatePath } from "next/cache";
import type { ServiceType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  copyPeriodRates,
  createRatePeriod,
  deleteRatePeriod,
  savePeriodCells,
  updateRatePeriodMeta,
  type CellSave,
} from "@/lib/rates";

export async function createPeriodAction(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const name = String(formData.get("name") || "").trim();
  const validFrom = String(formData.get("validFrom") || "");
  const validTo = String(formData.get("validTo") || "");
  const copyFromPeriodId = String(formData.get("copyFromPeriodId") || "") || undefined;
  const percentAdjust = formData.get("percentAdjust")
    ? Number(formData.get("percentAdjust"))
    : 0;
  if (!name || !validFrom || !validTo) {
    throw new Error("Nombre y fechas son obligatorios");
  }
  const period = await createRatePeriod(prisma, {
    name,
    validFrom,
    validTo,
    copyFromPeriodId,
    percentAdjust,
  });
  await writeAudit({
    userId: user.id,
    action: "rate.period_create",
    entityType: "RatePeriod",
    entityId: period.id,
    after: { name, validFrom, validTo, copyFromPeriodId },
  });
  revalidatePath("/tarifas");
  revalidatePath("/calendario");
  revalidatePath("/admin");
  return { ok: true as const, id: period.id };
}

export async function updatePeriodMetaAction(payload: {
  id: string;
  name?: string;
  validFrom?: string;
  validTo?: string;
  active?: boolean;
}) {
  const user = await requireUser(["ADMIN"]);
  const period = await updateRatePeriodMeta(prisma, payload);
  await writeAudit({
    userId: user.id,
    action: "rate.period_update",
    entityType: "RatePeriod",
    entityId: period.id,
    after: payload,
  });
  revalidatePath("/tarifas");
  revalidatePath("/calendario");
  revalidatePath("/admin");
  return { ok: true as const };
}

export async function deletePeriodAction(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const id = String(formData.get("id"));
  await deleteRatePeriod(prisma, id);
  await writeAudit({
    userId: user.id,
    action: "rate.period_delete",
    entityType: "RatePeriod",
    entityId: id,
  });
  revalidatePath("/tarifas");
  revalidatePath("/calendario");
  revalidatePath("/admin");
  return { ok: true as const };
}

export async function savePeriodMatrixAction(payload: {
  periodId: string;
  cells: {
    commercialCategoryId: string;
    serviceType: ServiceType;
    amountArs: number | null;
  }[];
}) {
  const user = await requireUser(["ADMIN"]);
  for (const c of payload.cells) {
    if (c.amountArs != null && c.amountArs <= 0) {
      throw new Error("Los montos deben ser mayores a 0 (o vacíos)");
    }
  }
  const cells: CellSave[] = payload.cells;
  await savePeriodCells(prisma, payload.periodId, cells);
  await writeAudit({
    userId: user.id,
    action: "rate.period_matrix_save",
    entityType: "RatePeriod",
    entityId: payload.periodId,
    after: { cellCount: cells.length },
  });
  revalidatePath("/tarifas");
  return { ok: true as const };
}

export async function copyPeriodAction(payload: {
  sourcePeriodId: string;
  targetPeriodId: string;
  percentAdjust?: number;
}) {
  const user = await requireUser(["ADMIN"]);
  await copyPeriodRates(prisma, payload);
  await writeAudit({
    userId: user.id,
    action: "rate.period_copy",
    entityType: "RatePeriod",
    entityId: payload.targetPeriodId,
    after: payload,
  });
  revalidatePath("/tarifas");
  return { ok: true as const };
}
