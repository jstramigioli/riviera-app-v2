import { describe, expect, it } from "vitest";
import {
  guestHasMissingFields,
  isPlaceholderGuestName,
  missingGuestFieldLabels,
} from "@/lib/guest-completeness";

describe("guest-completeness", () => {
  it("detects placeholder companion names", () => {
    expect(
      isPlaceholderGuestName({
        firstName: "Acompañante 2",
        lastName: "Podesta",
        phone: null,
        email: null,
        documentNumber: null,
      }),
    ).toBe(true);
  });

  it("lists missing hotel fields in Spanish", () => {
    const labels = missingGuestFieldLabels({
      firstName: "Pedro",
      lastName: "Marchese",
      phone: null,
      email: null,
      documentNumber: null,
    });
    expect(labels).toEqual(["documento", "teléfono", "correo"]);
    expect(guestHasMissingFields({
      firstName: "Pedro",
      lastName: "Marchese",
      phone: "011",
      email: "a@b.c",
      documentNumber: "123",
    })).toBe(false);
  });
});
