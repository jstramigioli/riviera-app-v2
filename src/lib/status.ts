import type { PaymentStatus } from "@prisma/client";

export {
  RESERVATION_STATUS_LABEL,
  RESERVATION_STATUS_COLOR,
  PAYMENT_STATUS_LABEL,
} from "./labels";

export function derivePaymentStatus(
  agreedPriceArs: number | null,
  netPaidArs: number,
): PaymentStatus {
  if (agreedPriceArs == null || agreedPriceArs === 0) {
    return netPaidArs > 0 ? "A_FAVOR" : "SIN_PAGO";
  }
  if (netPaidArs <= 0) return "SIN_PAGO";
  if (netPaidArs < agreedPriceArs * 0.3) return "SENIA_PARCIAL";
  if (netPaidArs < agreedPriceArs) return "PARCIAL";
  if (netPaidArs === agreedPriceArs) return "SALDADO";
  return "A_FAVOR";
}
