// Phase 12 / FR-SET-05: the reason_codes table (Owner-managed in Settings) is
// now the runtime source of truth — this list only seeds that table's initial
// rows (features/settings/actions/reason-codes.ts's ensureSeeded), so historical
// inventory_movements.reason_code values from before Phase 12 stay valid.
export const STOCK_OUT_REASON_CODES = [
  { value: "spoiled", label: "ของเสีย/หมดอายุ" },
  { value: "broken", label: "ตกแตก/เสียหาย" },
  { value: "testing", label: "ใช้ทดสอบ/ชิม" },
  { value: "other", label: "อื่นๆ" },
] as const;

export type StockOutReasonCode = (typeof STOCK_OUT_REASON_CODES)[number]["value"];
