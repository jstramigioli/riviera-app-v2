import type { Currency, PaymentType } from "@prisma/client";
import { prisma } from "./db";
import { arsFromUsd, toDecimal } from "./money";
import { writeAudit } from "./audit";
import { refreshPaymentStatus } from "./reservations";

async function nextReceiptNumber(): Promise<string> {
  const count = await prisma.payment.count();
  return `REC-${String(count + 1).padStart(5, "0")}`;
}

export async function createPayment(input: {
  reservationId: string;
  type: PaymentType;
  currency: Currency;
  amountOriginal: number;
  fxRateToArs?: number | null;
  notes?: string;
  userId?: string;
}) {
  if (input.currency === "USD") {
    if (input.fxRateToArs == null || input.fxRateToArs <= 0) {
      throw new Error("Cotización blue (FX) obligatoria para pagos USD");
    }
  }

  const amountArs =
    input.currency === "USD"
      ? arsFromUsd(input.amountOriginal, input.fxRateToArs!)
      : toDecimal(input.amountOriginal);

  const receiptNumber = await nextReceiptNumber();
  const payment = await prisma.payment.create({
    data: {
      reservationId: input.reservationId,
      type: input.type,
      currency: input.currency,
      amountOriginal: toDecimal(input.amountOriginal),
      fxRateToArs: input.fxRateToArs != null ? toDecimal(input.fxRateToArs) : null,
      amountArs,
      receiptNumber,
      notes: input.notes,
      createdById: input.userId,
    },
  });

  await refreshPaymentStatus(input.reservationId);
  await writeAudit({
    userId: input.userId,
    action: "payment.create",
    entityType: "Payment",
    entityId: payment.id,
    after: {
      receiptNumber,
      type: input.type,
      currency: input.currency,
      amountArs: amountArs.toString(),
    },
  });
  return payment;
}

/** Soft-void: never hard-delete payments. */
export async function voidPayment(
  paymentId: string,
  reason: string,
  userId?: string,
) {
  const current = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (current.voidedAt) throw new Error("El pago ya está anulado");
  const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: { voidedAt: new Date(), voidReason: reason },
  });
  await refreshPaymentStatus(current.reservationId);
  await writeAudit({
    userId,
    action: "payment.void",
    entityType: "Payment",
    entityId: paymentId,
    before: { voidedAt: null },
    after: { voidedAt: payment.voidedAt, reason },
  });
  return payment;
}

export async function getUsdBlueRate(): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key: "usd_blue_rate" } });
  if (!s || typeof s.valueJson !== "object" || s.valueJson === null) return 1400;
  const v = s.valueJson as { rate?: number };
  return typeof v.rate === "number" ? v.rate : 1400;
}

export async function setUsdBlueRate(rate: number, userId?: string) {
  const setting = await prisma.appSetting.upsert({
    where: { key: "usd_blue_rate" },
    update: { valueJson: { rate } },
    create: { key: "usd_blue_rate", valueJson: { rate } },
  });
  await writeAudit({
    userId,
    action: "settings.usd_blue_rate",
    entityType: "AppSetting",
    entityId: setting.id,
    after: { rate },
  });
  return setting;
}
