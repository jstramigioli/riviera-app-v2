import { describe, expect, it } from "vitest";
import { toDateOnly, isoDate } from "../src/lib/dates";
import {
  assertStayDatesOpen,
  calendarFocusDate,
  closedNightsInStay,
  howManyDaysFit,
  isDateClosed,
  isDateOpen,
  nextOpenDate,
  stayHasClosedNights,
} from "../src/lib/hotel-calendar";

/** Hotel open only Jan–Apr and Oct–Dec (gaps May–Sep closed). */
const seasonA = {
  name: "Alta",
  openFrom: toDateOnly("2027-01-01"),
  openTo: toDateOnly("2027-04-30"),
};
const seasonB = {
  name: "Puente mayo",
  openFrom: toDateOnly("2027-05-23"),
  openTo: toDateOnly("2027-05-26"),
};
const seasonC = {
  name: "Primavera-verano",
  openFrom: toDateOnly("2027-10-01"),
  openTo: toDateOnly("2027-12-31"),
};
const periods = [seasonA, seasonB, seasonC];

describe("hotel open periods (temporadas abiertas)", () => {
  it("is open only inside configured windows", () => {
    expect(isDateOpen("2027-03-15", periods)).toBe(true);
    expect(isDateOpen("2027-05-24", periods)).toBe(true);
    expect(isDateOpen("2027-05-01", periods)).toBe(false);
    expect(isDateClosed("2027-06-15", periods)).toBe(true);
    expect(isDateOpen("2027-04-30", periods)).toBe(true);
    expect(isDateOpen("2027-05-01", periods)).toBe(false);
  });

  it("centers on today if open, else next temporada start", () => {
    expect(isoDate(calendarFocusDate("2027-03-10", periods))).toBe("2027-03-10");
    expect(isoDate(calendarFocusDate("2027-05-10", periods))).toBe("2027-05-23");
    expect(isoDate(nextOpenDate("2027-05-27", periods))).toBe("2027-10-01");
  });

  it("blocks stays that touch nights outside open windows", () => {
    expect(stayHasClosedNights("2027-04-28", "2027-05-02", periods)).toBe(true);
    expect(stayHasClosedNights("2027-04-28", "2027-05-01", periods)).toBe(false);
    expect(stayHasClosedNights("2027-05-23", "2027-05-27", periods)).toBe(false);
    expect(stayHasClosedNights("2027-05-23", "2027-05-28", periods)).toBe(true);

    const nights = closedNightsInStay("2027-04-29", "2027-05-02", periods);
    expect(nights.map(isoDate)).toEqual(["2027-05-01"]);

    expect(() =>
      assertStayDatesOpen("2027-06-10", "2027-06-12", periods),
    ).toThrow(/cerrado|temporada abierta/i);
    expect(() =>
      assertStayDatesOpen("2027-03-01", "2027-03-03", periods),
    ).not.toThrow();
  });

  it("treats empty open-period list as always closed", () => {
    expect(isDateOpen("2027-01-01", [])).toBe(false);
    expect(stayHasClosedNights("2027-01-01", "2027-01-03", [])).toBe(true);
  });

  it("fits as many day columns as the viewport allows", () => {
    expect(howManyDaysFit(140 + 42 * 10)).toBe(10);
    expect(howManyDaysFit(200, { minDays: 3 })).toBeGreaterThanOrEqual(3);
  });
});
