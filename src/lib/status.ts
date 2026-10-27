import type { PaymentStatus, ReservationStatus } from "@prisma/client";

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  CONSULTA: "Consulta",
  PRERRESERVA: "Prerreserva",
  CONFIRMADA: "Confirmada",
  CANCELADA: "Cancelada",
  IN_HOUSE: "In-house",
  FINALIZADA: "Finalizada",
};

export const RESERVATION_STATUS_COLOR: Record<ReservationStatus, string> = {
  CONSULTA: "#94a3b8",
  PRERRESERVA: "#f59e0b",
  CONFIRMADA: "#0d9488",
  CANCELADA: "#64748b",
  IN_HOUSE: "#2563eb",
  FINALIZADA: "#475569",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  SIN_PAGO: "Sin pago",
  SENIA_PARCIAL: "Seña parcial",
  PARCIAL: "Parcial",
  SALDADO: "Saldado",
  A_FAVOR: "A favor",
};

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
