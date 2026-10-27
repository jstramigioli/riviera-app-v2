import { describe, expect, it } from "vitest";
import { eachNight, rangesOverlap, toDateOnly } from "../src/lib/dates";

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
