"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Currency, PaymentType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { createPayment, setUsdBlueRate, voidPayment } from "@/lib/payments";

export async function createPaymentAction(formData: FormData) {
  const user = await requireUser();
  const reservationId = String(formData.get("reservationId"));
  try {
    await createPayment({
      reservationId,
      type: String(formData.get("type")) as PaymentType,
      currency: String(formData.get("currency")) as Currency,
      amountOriginal: Number(formData.get("amountOriginal")),
      fxRateToArs: formData.get("fxRateToArs")
        ? Number(formData.get("fxRateToArs"))
        : null,
      notes: String(formData.get("notes") || "") || undefined,
      userId: user.id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de pago";
    redirect(`/reservas/${reservationId}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath(`/reservas/${reservationId}`);
  redirect(`/reservas/${reservationId}`);
}

export async function voidPaymentAction(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const paymentId = String(formData.get("paymentId"));
  const reservationId = String(formData.get("reservationId"));
  const reason = String(formData.get("reason") || "Anulación");
  await voidPayment(paymentId, reason, user.id);
  revalidatePath(`/reservas/${reservationId}`);
  redirect(`/reservas/${reservationId}`);
}

export async function setBlueRateAction(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  await setUsdBlueRate(Number(formData.get("rate")), user.id);
  revalidatePath("/admin");
  redirect("/admin");
}
