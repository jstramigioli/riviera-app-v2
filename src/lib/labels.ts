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

export const SERVICE_TYPES: ServiceType[] = [
  "SIN_DESAYUNO",
  "DESAYUNO",
  "MEDIA_PENSION",
];

export const UNIT_KIND_LABEL: Record<UnitKind, string> = {
  HABITACION: "Habitación",
  DEPARTAMENTO: "Departamento",
};

export const REQUIREMENT_KIND_LABEL: Record<RequirementKind, string> = {
  DESIRED: "Deseada",
};

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  /** Legacy — no crear; usar entidad Query / sección Consultas */
  CONSULTA: "Consulta (legado)",
  /** Copy: pendiente ≡ prerreserva (D-03) */
  PRERRESERVA: "Prerreserva",
  CONFIRMADA: "Confirmada",
  CANCELADA: "Cancelada",
  IN_HOUSE: "Ingresada",
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

/** Historial de cambios — etiquetas en español de hotel. */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "reservation.create": "Creó reserva",
  "reservation.status": "Cambió estado de reserva",
  "reservation.price_override": "Ajustó precio de reserva",
  "reservation.add_segment": "Agregó tramo de habitación",
  "reservation.room_locked": "Cambió fijación de habitación",
  "reservation.link_guest": "Vinculó huésped",
  "query.create": "Creó consulta",
  "query.delete": "Eliminó consulta",
  "query.archive": "Archivó consulta",
  "query.convert": "Convirtió consulta en reserva",
  "payment.create": "Registró pago",
  "payment.void": "Anuló pago",
  "settings.usd_blue_rate": "Actualizó cotización USD blue",
  "rate.period_create": "Creó temporada / tarifas",
  "rate.period_update": "Editó temporada / tarifas",
  "rate.period_delete": "Eliminó temporada / tarifas",
  "rate.period_matrix_save": "Guardó precios de temporada",
  "rate.period_copy": "Copió precios entre temporadas",
  "hotel_open_period.create": "Creó temporada (legado)",
  "hotel_open_period.deactivate": "Desactivó temporada (legado)",
  "inventory.unit_upsert": "Guardó habitación",
  "inventory.category_upsert": "Guardó categoría",
  "inventory.attribute_upsert": "Guardó característica",
  "inventory.unit_attributes": "Actualizó características de habitación",
  "optimizer.apply": "Aplicó optimizador de ocupación",
};

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  Reservation: "Reserva",
  Query: "Consulta",
  Payment: "Pago",
  RatePeriod: "Temporada",
  HotelOpenPeriod: "Temporada (legado)",
  PhysicalUnit: "Habitación",
  CommercialCategory: "Categoría",
  UnitAttribute: "Característica",
  AppSetting: "Configuración",
  Optimizer: "Optimizador",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action.replace(/[._]/g, " ");
}

export function auditEntityLabel(entityType: string): string {
  return AUDIT_ENTITY_LABEL[entityType] ?? entityType;
}

export function roomDisplayName(code: string, name: string, kind: UnitKind): string {
  if (kind === "DEPARTAMENTO") return name || `Departamento ${code}`;
  return name || `Habitación ${code}`;
}

/** Communicating rooms — never “compuesta” in UI. Codes come from DB. */
export function communicatingRoomsLabel(code: string, name?: string | null): string {
  if (name && !/compuest/i.test(name) && !/composite/i.test(name)) return name;
  return `Habitaciones comunicadas ${code}`;
}

export function formatArsPlain(n: number): string {
  return Math.round(n).toLocaleString("es-AR");
}
