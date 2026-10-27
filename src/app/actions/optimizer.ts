"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  applyOccupancyOptimizer,
  previewOccupancyOptimizer,
  type OptimizerPreview,
} from "@/lib/optimizer";

export async function previewOptimizerAction(formData: FormData): Promise<
  | { ok: true; preview: OptimizerPreview }
  | { ok: false; error: string }
> {
  await requireUser();
  const windowStart = String(formData.get("windowStart") || "");
  const windowEnd = String(formData.get("windowEnd") || "");
  try {
    const preview = await previewOccupancyOptimizer(prisma, {
      windowStart,
      windowEnd,
    });
    return { ok: true, preview };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al calcular preview",
    };
  }
}

export async function applyOptimizerAction(formData: FormData) {
  const user = await requireUser();
  const raw = String(formData.get("movesJson") || "[]");
  let moves: { reservationId: string; toUnitId: string }[] = [];
  try {
    moves = JSON.parse(raw) as { reservationId: string; toUnitId: string }[];
  } catch {
    return { ok: false as const, error: "Payload de cambios inválido" };
  }
  if (!moves.length) {
    return { ok: false as const, error: "No hay cambios para aplicar" };
  }
  // Require explicit confirmation token
  if (formData.get("confirmApply") !== "yes") {
    return {
      ok: false as const,
      error: "Confirmá el preview antes de aplicar los cambios",
    };
  }
  try {
    const result = await applyOccupancyOptimizer(prisma, {
      moves,
      userId: user.id,
    });
    revalidatePath("/calendario");
    revalidatePath("/reservas");
    return { ok: true as const, applied: result.applied };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Error al aplicar",
    };
  }
}
