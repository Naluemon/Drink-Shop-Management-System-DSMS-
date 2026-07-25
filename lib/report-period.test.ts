import { describe, it, expect } from "vitest";
import { getBusinessDayRange } from "./business-day";
import { buildReportBuckets } from "./report-period";

const TZ = "Asia/Bangkok";
const START_HOUR = 5;

describe("buildReportBuckets", () => {
  it("daily: splits a 3-day range into 3 exact 24h buckets", () => {
    const from = new Date("2026-07-24T00:00:00Z");
    const to = new Date("2026-07-26T00:00:00Z");
    const buckets = buildReportBuckets("daily", from, to, TZ, START_HOUR);

    expect(buckets).toHaveLength(3);
    for (const b of buckets) {
      expect(b.end.getTime() - b.start.getTime()).toBe(24 * 60 * 60 * 1000);
    }
    expect(buckets[0].start.toISOString()).toBe(
      getBusinessDayRange(from, TZ, START_HOUR).start.toISOString(),
    );
    expect(buckets[2].end.toISOString()).toBe(
      getBusinessDayRange(to, TZ, START_HOUR).end.toISOString(),
    );
  });

  it("weekly: an exact 14-day span yields 2 buckets of 7 days each", () => {
    const from = new Date("2026-07-01T00:00:00Z");
    const to = new Date("2026-07-14T00:00:00Z");
    const buckets = buildReportBuckets("weekly", from, to, TZ, START_HOUR);

    expect(buckets).toHaveLength(2);
    for (const b of buckets) {
      expect(b.end.getTime() - b.start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    }
    expect(buckets[1].end.toISOString()).toBe(
      getBusinessDayRange(to, TZ, START_HOUR).end.toISOString(),
    );
  });

  it("monthly: a mid-month-to-mid-month range yields partial/full/partial buckets, full bucket = calendar month length", () => {
    // 2026 is not a leap year -> February has 28 days
    const from = new Date("2026-01-15T00:00:00Z");
    const to = new Date("2026-03-15T00:00:00Z");
    const buckets = buildReportBuckets("monthly", from, to, TZ, START_HOUR);

    expect(buckets).toHaveLength(3);
    expect(buckets[0].start.toISOString()).toBe(
      getBusinessDayRange(from, TZ, START_HOUR).start.toISOString(),
    );
    // Middle bucket (February) must be the full calendar month: exactly 28 days
    expect(buckets[1].end.getTime() - buckets[1].start.getTime()).toBe(28 * 24 * 60 * 60 * 1000);
    expect(buckets[2].end.toISOString()).toBe(
      getBusinessDayRange(to, TZ, START_HOUR).end.toISOString(),
    );
  });

  it("yearly: spans multiple calendar years, first (leap) bucket = 366 days", () => {
    // 2024 is a leap year
    const from = new Date("2024-01-01T00:00:00Z");
    const to = new Date("2026-06-01T00:00:00Z");
    const buckets = buildReportBuckets("yearly", from, to, TZ, START_HOUR);

    expect(buckets).toHaveLength(3);
    expect(buckets[0].end.getTime() - buckets[0].start.getTime()).toBe(366 * 24 * 60 * 60 * 1000);
    expect(buckets[1].end.getTime() - buckets[1].start.getTime()).toBe(365 * 24 * 60 * 60 * 1000);
  });

  it("respects the business day start hour when bucketing a late-night sale (TC-BIZDAY-01)", () => {
    // A sale at 2026-07-25 01:30 Bangkok belongs to the 2026-07-24 business day
    const saleTimestamp = new Date("2026-07-24T18:30:00Z"); // 01:30 Bangkok on the 25th
    const from = new Date("2026-07-24T00:00:00Z");
    const to = new Date("2026-07-24T00:00:00Z");
    const buckets = buildReportBuckets("daily", from, to, TZ, START_HOUR);

    expect(buckets).toHaveLength(1);
    expect(saleTimestamp >= buckets[0].start && saleTimestamp < buckets[0].end).toBe(true);
  });
});
