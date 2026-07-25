import { describe, it, expect } from "vitest";
import { getBusinessDayRange, isInBusinessDay } from "./business-day";

// DECISIONS.md D8: business day starts at business_day_start_hour local time
// (default 05:00 Asia/Bangkok, UTC+7), not calendar midnight.
describe("getBusinessDayRange", () => {
  it("covers 05:00 today -> 05:00 tomorrow (Bangkok local) for a mid-day reference", () => {
    // 2026-07-24 08:00 Bangkok = 2026-07-24 01:00 UTC
    const reference = new Date("2026-07-24T01:00:00Z");
    const { start, end } = getBusinessDayRange(reference, "Asia/Bangkok", 5);

    expect(start.toISOString()).toBe("2026-07-23T22:00:00.000Z"); // 05:00 Bangkok on the 24th
    expect(end.toISOString()).toBe("2026-07-24T22:00:00.000Z"); // 05:00 Bangkok on the 25th
  });

  it("rolls back to the previous business day for a timestamp before the start hour", () => {
    // 2026-07-24 02:00 Bangkok (after midnight, before 05:00 start) = 2026-07-23 19:00 UTC
    const reference = new Date("2026-07-23T19:00:00Z");
    const { start } = getBusinessDayRange(reference, "Asia/Bangkok", 5);

    // Should belong to the business day that started on the 23rd, not the 24th
    expect(start.toISOString()).toBe("2026-07-22T22:00:00.000Z"); // 05:00 Bangkok on the 23rd
  });
});

describe("isInBusinessDay", () => {
  it("treats late-night sales (after midnight, before start hour) as still 'yesterday' (D8 rationale)", () => {
    // A sale at 2026-07-24 01:00 Bangkok (1am) should count as the 23rd's business day
    const saleTimestamp = new Date("2026-07-23T18:00:00Z"); // 01:00 Bangkok on the 24th
    // Reference "now" is also 01:00 Bangkok on the 24th
    const now = new Date("2026-07-23T18:00:00Z");

    expect(isInBusinessDay(saleTimestamp, now, "Asia/Bangkok", 5)).toBe(true);
  });

  it("returns false once the reference date has moved to the next business day", () => {
    const saleTimestamp = new Date("2026-07-24T01:00:00Z"); // sale during the 24th's business day
    const now = new Date("2026-07-25T01:00:00Z"); // "now" is a full business day later
    expect(isInBusinessDay(saleTimestamp, now, "Asia/Bangkok", 5)).toBe(false);
  });
});
