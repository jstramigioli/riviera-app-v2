"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RequirementKind, ServiceType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import {
  convertQueryToReservation,
  deleteQuery,
  upsertQueryDraft,
} from "@/lib/queries";

function parseRequirements(formData: FormData) {
  const mandatory = String(formData.get("mandatoryAttributeIds") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const preference = String(formData.get("preferenceAttributeIds") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [
    ...mandatory.map((attributeId) => ({
      attributeId,
      kind: "MANDATORY" as RequirementKind,
    })),
    ...preference
      .filter((id) => !mandatory.includes(id))
      .map((attributeId) => ({
        attributeId,
        kind: "PREFERENCE" as RequirementKind,
      })),
  ];
}

export async function upsertQueryAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") || "") || undefined;
  try {
    const query = await upsertQueryDraft({
      id,
      checkInDate: String(formData.get("checkInDate")),
      checkOutDate: String(formData.get("checkOutDate")),
      adults: Number(formData.get("adults") || 2),
      children: Number(formData.get("children") || 0),
      serviceType: String(formData.get("serviceType") || "DESAYUNO") as ServiceType,
      channel: String(formData.get("channel") || "") || null,
      notes: String(formData.get("notes") || "") || null,
      guestFirstName: String(formData.get("guestFirstName") || "") || null,
      guestLastName: String(formData.get("guestLastName") || "") || null,
      guestPhone: String(formData.get("guestPhone") || "") || null,
      guestEmail: String(formData.get("guestEmail") || "") || null,
      guestDocumentNumber: String(formData.get("guestDocumentNumber") || "") || null,
      structuredRequirements: parseRequirements(formData),
      userId: user.id,
    });
    revalidatePath("/consultas");
    revalidatePath(`/consultas/${query.id}`);
    return { ok: true as const, id: query.id, code: query.code };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al guardar consulta";
    return { ok: false as const, error: msg };
  }
}

/** Client autosave: JSON body via FormData fields. */
export async function autosaveQueryAction(payload: {
  id?: string;
  checkInDate: string;
  checkOutDate: string;
  adults?: number;
  children?: number;
  serviceType?: ServiceType;
  channel?: string | null;
  notes?: string | null;
  guestFirstName?: string | null;
  guestLastName?: string | null;
  guestPhone?: string | null;
  guestEmail?: string | null;
  guestDocumentNumber?: string | null;
  mandatoryAttributeIds?: string[];
  preferenceAttributeIds?: string[];
}) {
  const user = await requireUser();
  if (!payload.checkInDate || !payload.checkOutDate) {
    return { ok: false as const, error: "Faltan fechas" };
  }
  if (payload.checkInDate >= payload.checkOutDate) {
    return { ok: false as const, error: "Salida debe ser posterior a llegada" };
  }
  // Autosave minimum: dates; guest name optional but preferred
  const mandatory = payload.mandatoryAttributeIds ?? [];
  const preference = payload.preferenceAttributeIds ?? [];
  try {
    const query = await upsertQueryDraft({
      id: payload.id,
      checkInDate: payload.checkInDate,
      checkOutDate: payload.checkOutDate,
      adults: payload.adults,
      children: payload.children,
      serviceType: payload.serviceType,
      channel: payload.channel,
      notes: payload.notes,
      guestFirstName: payload.guestFirstName,
      guestLastName: payload.guestLastName,
      guestPhone: payload.guestPhone,
      guestEmail: payload.guestEmail,
      guestDocumentNumber: payload.guestDocumentNumber,
      structuredRequirements: [
        ...mandatory.map((attributeId) => ({
          attributeId,
          kind: "MANDATORY" as RequirementKind,
        })),
        ...preference
          .filter((id) => !mandatory.includes(id))
          .map((attributeId) => ({
            attributeId,
            kind: "PREFERENCE" as RequirementKind,
          })),
      ],
      userId: user.id,
    });
    revalidatePath("/consultas");
    return { ok: true as const, id: query.id, code: query.code };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al guardar";
    return { ok: false as const, error: msg };
  }
}

export async function deleteQueryAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  await deleteQuery(id, user.id);
  revalidatePath("/consultas");
  redirect("/consultas");
}

export async function convertQueryAction(formData: FormData) {
  const user = await requireUser();
  const queryId = String(formData.get("queryId"));
  const physicalUnitId = String(formData.get("physicalUnitId") || "") || undefined;
  const compositeUnitId = String(formData.get("compositeUnitId") || "") || undefined;
  const allowOverride = formData.get("allowMandatoryOverride") === "on" ||
    formData.get("allowMandatoryOverride") === "true" ||
    formData.get("allowMandatoryOverride") === "1";
  const overrideNote = String(formData.get("overrideNote") || "") || undefined;
  const roomLocked = formData.get("roomLocked") === "on";
  const statusRaw = String(formData.get("status") || "PRERRESERVA");
  const status =
    statusRaw === "CONFIRMADA" ? ("CONFIRMADA" as const) : ("PRERRESERVA" as const);

  try {
    const reservation = await convertQueryToReservation({
      queryId,
      physicalUnitId,
      compositeUnitId,
      status,
      agreedPriceArs: formData.get("agreedPriceArs")
        ? Number(formData.get("agreedPriceArs"))
        : null,
      roomLocked,
      allowMandatoryOverride: allowOverride,
      overrideNote,
      userId: user.id,
    });
    revalidatePath("/consultas");
    revalidatePath("/calendario");
    revalidatePath("/reservas");
    redirect(`/reservas/${reservation.id}`);
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "digest" in e &&
      typeof (e as { digest: unknown }).digest === "string" &&
      (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw e;
    }
    const msg = e instanceof Error ? e.message : "Error al convertir";
    redirect(`/consultas/${queryId}?error=${encodeURIComponent(msg)}`);
  }
}
