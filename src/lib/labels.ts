import type {
  PaymentStatus,
  RequirementKind,
  ReservationStatus,
  ServiceType,
  UnitKind,
} from "@prisma/client";

/** Hotel-facing copy. Never expose domain model jargon in UI. */

export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  SIN_DESAYUNO: "Sin desayuno",
  DESAYUNO: "Desayuno",
  MEDIA_PENSION: "Media pensión",
};

export const UNIT_KIND_LABEL: Record<UnitKind, string> = {
  HABITACION: "Habitación",
  DEPARTAMENTO: "Departamento",
};

export const REQUIREMENT_KIND_LABEL: Record<RequirementKind, string> = {
  MANDATORY: "Obligatorio",
  PREFERENCE: "Preferencia",
};

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  /** Legacy — no crear; usar entidad Query / sección Consultas */
  CONSULTA: "Consulta (legado)",
  PRERRESERVA: "Prerreserva",
  CONFIRMADA: "Confirmada",
  CANCELADA: "Cancelada",
  IN_HOUSE: "En casa",
  FINALIZADA: "Finalizada",
};

export const QUERY_STATUS_LABEL: Record<string, string> = {
  OPEN: "Abierta",
  CONVERTED: "Convertida",
  ARCHIVED: "Archivada",
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

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administración",
  RECEPCION: "Recepción",
};

export function roomDisplayName(code: string, name: string, kind: UnitKind): string {
  if (kind === "DEPARTAMENTO") return name || `Departamento ${code}`;
  return name || `Habitación ${code}`;
}

/** Communicating rooms (8+9, 35+36) — never “compuesta” in UI. */
export function communicatingRoomsLabel(code: string, name?: string | null): string {
  if (name && !/compuest/i.test(name) && !/composite/i.test(name)) return name;
  return `Habitaciones comunicadas ${code}`;
}
