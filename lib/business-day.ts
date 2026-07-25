// ARCHITECTURE.md §6: single shared utility for "which business day does this
// timestamp belong to" — Phase 8's Void cutoff, Phase 10's Dashboard "today",
// and Phase 11's Reports date grouping must all call this, never re-derive
// business-day boundaries with ad hoc calendar-day logic.
//
// Simplification: assumes a fixed UTC offset (no DST) for the given IANA
// zone. True for every zone this system actually targets (Asia/Bangkok,
// UTC+7 — see PROJECT_SCOPE.md, Thailand-only). If multi-country deployment
// is ever needed, replace getUtcOffsetMinutes with a real tz library.
export function getUtcOffsetMinutes(timezone: string, at: Date): number {
  const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  const local = new Date(at.toLocaleString("en-US", { timeZone: timezone }));
  return Math.round((local.getTime() - utc.getTime()) / 60_000);
}

export interface BusinessDayRange {
  start: Date;
  end: Date;
}

// Returns [start, end) as real UTC instants — the 24h window covering
// `referenceDate`, starting at `businessDayStartHour` local time (DECISIONS.md
// D8), not calendar midnight.
export function getBusinessDayRange(
  referenceDate: Date,
  timezone: string,
  businessDayStartHour: number,
): BusinessDayRange {
  const offsetMinutes = getUtcOffsetMinutes(timezone, referenceDate);
  // Shift into a "local-time-as-UTC" frame so UTC getters read local wall-clock values.
  const localFrame = new Date(referenceDate.getTime() + offsetMinutes * 60_000);

  const businessStartLocalFrame = new Date(
    Date.UTC(
      localFrame.getUTCFullYear(),
      localFrame.getUTCMonth(),
      localFrame.getUTCDate(),
      businessDayStartHour,
      0,
      0,
      0,
    ),
  );

  if (localFrame < businessStartLocalFrame) {
    businessStartLocalFrame.setUTCDate(businessStartLocalFrame.getUTCDate() - 1);
  }

  const start = new Date(businessStartLocalFrame.getTime() - offsetMinutes * 60_000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function isInBusinessDay(
  timestamp: Date,
  referenceDate: Date,
  timezone: string,
  businessDayStartHour: number,
): boolean {
  const { start, end } = getBusinessDayRange(referenceDate, timezone, businessDayStartHour);
  return timestamp >= start && timestamp < end;
}
