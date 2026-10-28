import { describe, expect, it } from "vitest";
import {
  eachNight,
  formatDateShortUi,
  formatDateTimeUi,
  formatDateUi,
  rangesOverlap,
  toDateOnly,
} from "../src/lib/dates";

describe("rangesOverlap (half-open)", () => {
  it("allows adjacent stays (checkout = next checkin)", () => {
    const aS = toDateOnly("2026-01-01");
    const aE = toDateOnly("2026-01-05");
    const bS = toDateOnly("2026-01-05");
    const bE = toDateOnly("2026-01-08");
    expect(rangesOverlap(aS, aE, bS, bE)).toBe(false);
  });

  it("detects overlapping nights", () => {
    const aS = toDateOnly("2026-01-01");
    const aE = toDateOnly("2026-01-05");
    const bS = toDateOnly("2026-01-04");
    const bE = toDateOnly("2026-01-08");
    expect(rangesOverlap(aS, aE, bS, bE)).toBe(true);
  });
});

describe("eachNight", () => {
  it("counts nights excluding checkout", () => {
    expect(eachNight(toDateOnly("2026-01-01"), toDateOnly("2026-01-04"))).toHaveLength(3);
  });
});

describe("formatDateUi (DD/MM/AAAA)", () => {
  it("formats Date and ISO string as DD/MM/AAAA", () => {
    expect(formatDateUi("2026-10-28")).toBe("28/10/2026");
    expect(formatDateUi(toDateOnly("2027-01-05"))).toBe("05/01/2027");
  });

  it("formats short DD/MM", () => {
    expect(formatDateShortUi("2026-03-09")).toBe("09/03");
  });

  it("formats datetime for historial", () => {
    expect(formatDateTimeUi(new Date("2026-10-28T15:30:00.000Z"))).toBe(
      "28/10/2026 15:30",
    );
  });

  it("renders sample excel-era dates", () => {
    expect(formatDateUi("2027-01-09")).toBe("09/01/2027");
    expect(formatDateShortUi("2027-01-09")).toBe("09/01");
  });
});
