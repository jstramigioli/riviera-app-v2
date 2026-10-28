import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toDateOnly } from "../src/lib/dates";
import {
  assertStayDatesOpen,
  isDateOpen,
} from "../src/lib/hotel-calendar";

describe("unified seasons (RatePeriod = open + tariffs)", () => {
  it("loadActiveOpenPeriods reads RatePeriod not HotelOpenPeriod", () => {
    const src = readFileSync(join(__dirname, "../src/lib/hotel-open.ts"), "utf8");
    expect(src).toMatch(/ratePeriod\.findMany/);
    expect(src).not.toMatch(/hotelOpenPeriod/);
  });

  it("schema no longer defines HotelOpenPeriod", () => {
    const schema = readFileSync(join(__dirname, "../prisma/schema.prisma"), "utf8");
    expect(schema).not.toMatch(/model HotelOpenPeriod/);
    expect(schema).toMatch(/model RatePeriod/);
    expect(schema).toMatch(/notes\s+String\?/);
  });

  it("open logic still uses OpenPeriodRange shape from seasons", () => {
    const seasons = [
      {
        name: "Alta",
        openFrom: toDateOnly("2027-01-01"),
        openTo: toDateOnly("2027-04-30"),
      },
    ];
    expect(isDateOpen("2027-02-10", seasons)).toBe(true);
    expect(isDateOpen("2027-06-10", seasons)).toBe(false);
    expect(() =>
      assertStayDatesOpen("2027-06-10", "2027-06-12", seasons),
    ).toThrow(/cerrado|temporada/i);
  });

  it("TarifasBoard matrix is rows=categories cols=services", () => {
    const src = readFileSync(
      join(__dirname, "../src/components/TarifasBoard.tsx"),
      "utf8",
    );
    expect(src).toMatch(/Filas = categorías; columnas = servicios/);
    expect(src).toMatch(/Copiar precios de otro período/);
    expect(src).not.toMatch(/Pegar desde/);
    expect(src).not.toMatch(/grouped/);
  });
});
