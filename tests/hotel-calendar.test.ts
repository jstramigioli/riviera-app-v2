import { describe, expect, it } from "vitest";
import { addDays } from "date-fns";
import { toDateOnly, isoDate } from "../src/lib/dates";
import {
  assertStayDatesOpen,
  calendarFocusDate,
  closedNightsInStay,
  howManyDaysFit,
  isDateClosed,
  nextOpenDate,
  stayTouchesClosedPeriod,
} from "../src/lib/hotel-calendar";

const winter = {
  name: "Cierre invierno",
  closedFrom: toDateOnly("2027-06-01"),
  closedTo: toDateOnly("2027-08-31"),
};

describe("hotel closed periods", () => {
  it("detects closed dates inside inclusive range", () => {
    expect(isDateClosed("2027-06-01", [winter])).toBe(true);
    expect(isDateClosed("2027-08-31", [winter])).toBe(true);
    expect(isDateClosed("2027-05-31", [winter])).toBe(false);
    expect(isDateClosed("2027-09-01", [winter])).toBe(false);
  });

  it("centers on today when open, else next opening", () => {
    expect(isoDate(calendarFocusDate("2027-05-15", [winter]))).toBe("2027-05-15");
    expect(isoDate(calendarFocusDate("2027-07-10", [winter]))).toBe("2027-09-01");
    expect(isoDate(nextOpenDate("2027-08-31", [winter]))).toBe("2027-09-01");
  });

  it("blocks stays that touch closed nights (checkout exclusive)", () => {
    expect(stayTouchesClosedPeriod("2027-05-28", "2027-06-02", [winter])).toBe(true);
    expect(stayTouchesClosedPeriod("2027-05-28", "2027-06-01", [winter])).toBe(false);
    expect(stayTouchesClosedPeriod("2027-08-31", "2027-09-02", [winter])).toBe(true);
    expect(stayTouchesClosedPeriod("2027-09-01", "2027-09-03", [winter])).toBe(false);

    const nights = closedNightsInStay("2027-05-30", "2027-06-03", [winter]);
    expect(nights.map(isoDate)).toEqual(["2027-06-01", "2027-06-02"]);

    expect(() =>
      assertStayDatesOpen("2027-06-10", "2027-06-12", [winter]),
    ).toThrow(/cerrado/);
    expect(() =>
      assertStayDatesOpen("2027-05-01", "2027-05-03", [winter]),
    ).not.toThrow();
  });

  it("fits as many day columns as the viewport allows", () => {
    expect(howManyDaysFit(140 + 42 * 10)).toBe(10);
    expect(howManyDaysFit(200, { minDays: 3 })).toBeGreaterThanOrEqual(3);
    expect(howManyDaysFit(50, { minDays: 3 })).toBe(3);
  });

  it("handles adjacent closed periods for next open", () => {
    const periods = [
      winter,
      {
        name: "Extra",
        closedFrom: toDateOnly("2027-09-01"),
        closedTo: toDateOnly("2027-09-05"),
      },
    ];
    expect(isoDate(nextOpenDate("2027-07-01", periods))).toBe("2027-09-06");
    expect(isoDate(addDays(toDateOnly("2027-09-05"), 1))).toBe("2027-09-06");
  });
});
