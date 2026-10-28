/** Campos de ficha de pasajero que recepción suele necesitar. */
export type GuestContactLike = {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  documentNumber: string | null;
};

export function isPlaceholderGuestName(guest: GuestContactLike): boolean {
  if (/^Acompañante\s+\d+$/i.test(guest.firstName.trim())) return true;
  if (guest.lastName.trim() === "Sin nombre" || guest.lastName.trim() === "—") return true;
  if (guest.firstName.trim() === "—" || guest.firstName.trim() === "Huésped") return true;
  return false;
}

/** Etiquetas en español de hotel para lo que falta en la ficha. */
export function missingGuestFieldLabels(guest: GuestContactLike): string[] {
  const missing: string[] = [];
  if (isPlaceholderGuestName(guest)) missing.push("nombre completo");
  if (!guest.documentNumber?.trim()) missing.push("documento");
  if (!guest.phone?.trim()) missing.push("teléfono");
  if (!guest.email?.trim()) missing.push("correo");
  return missing;
}

export function guestHasMissingFields(guest: GuestContactLike): boolean {
  return missingGuestFieldLabels(guest).length > 0;
}
