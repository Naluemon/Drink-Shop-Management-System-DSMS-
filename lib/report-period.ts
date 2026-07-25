import { getBusinessDayRange, getUtcOffsetMinutes } from "./business-day";

// Phase 11 — Reports. FR-RPT-01: Daily/Weekly/Monthly/Yearly grouping, always
// on the business-day boundary (DECISIONS.md D8) — reuses getBusinessDayRange
// for every edge instead of re-deriving calendar-day math (ARCHITECTURE.md §6).

export type ReportGranularity = "daily" | "weekly" | "monthly" | "yearly";

export interface ReportBucket {
  label: string;
  start: Date;
  end: Date;
}

function localCalendarParts(date: Date, timezone: string): { year: number; month: number } {
  const offsetMinutes = getUtcOffsetMinutes(timezone, date);
  const localFrame = new Date(date.getTime() + offsetMinutes * 60_000);
  return { year: localFrame.getUTCFullYear(), month: localFrame.getUTCMonth() };
}

// Real UTC instant for "local calendar date {year}-{month+1}-01 at {businessDayStartHour}:00"
// in the given (fixed-offset, non-DST) timezone — see business-day.ts's module note.
function startOfLocalMonthInstant(
  year: number,
  month: number,
  businessDayStartHour: number,
  timezone: string,
): Date {
  const offsetMinutes = getUtcOffsetMinutes(timezone, new Date());
  const localFrame = new Date(Date.UTC(year, month, 1, businessDayStartHour, 0, 0));
  return new Date(localFrame.getTime() - offsetMinutes * 60_000);
}

function formatBucketLabel(
  granularity: ReportGranularity,
  start: Date,
  end: Date,
  timezone: string,
): string {
  if (granularity === "monthly" || granularity === "yearly") {
    const { year, month } = localCalendarParts(start, timezone);
    return granularity === "yearly" ? `ปี ${year}` : `${month + 1}/${year}`;
  }
  const dateOpts: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  };
  const startLabel = start.toLocaleDateString("th-TH", dateOpts);
  if (granularity === "daily") return startLabel;
  const endLabel = new Date(end.getTime() - 1).toLocaleDateString("th-TH", dateOpts);
  return `${startLabel} - ${endLabel}`;
}

// Splits [from, to] into consecutive, business-day-aligned buckets. Edge
// buckets may be partial (e.g. a "monthly" range starting mid-month yields a
// short first bucket) — the boundaries are always exact, never approximate.
export function buildReportBuckets(
  granularity: ReportGranularity,
  from: Date,
  to: Date,
  timezone: string,
  businessDayStartHour: number,
): ReportBucket[] {
  const buckets: ReportBucket[] = [];
  let cursor = getBusinessDayRange(from, timezone, businessDayStartHour).start;
  const overallEnd = getBusinessDayRange(to, timezone, businessDayStartHour).end;

  while (cursor < overallEnd) {
    let end: Date;
    if (granularity === "daily") {
      end = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    } else if (granularity === "weekly") {
      end = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (granularity === "monthly") {
      const { year, month } = localCalendarParts(cursor, timezone);
      end = startOfLocalMonthInstant(year, month + 1, businessDayStartHour, timezone);
    } else {
      const { year } = localCalendarParts(cursor, timezone);
      end = startOfLocalMonthInstant(year + 1, 0, businessDayStartHour, timezone);
    }
    if (end > overallEnd) end = overallEnd;

    buckets.push({
      label: formatBucketLabel(granularity, cursor, end, timezone),
      start: cursor,
      end,
    });
    cursor = end;
  }

  return buckets;
}
