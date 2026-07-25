import { describe, it, expect, vi, afterEach } from "vitest";
import { signPrintToken, verifyPrintToken } from "./print-token";

describe("print-token", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("verifies a token signed for the same payload", () => {
    const token = signPrintToken("granularity=daily&from=2026-07-01");
    expect(verifyPrintToken(token, "granularity=daily&from=2026-07-01")).toBe(true);
  });

  it("rejects a token checked against a different payload (can't be replayed onto another report)", () => {
    const token = signPrintToken("granularity=daily&from=2026-07-01");
    expect(verifyPrintToken(token, "granularity=daily&from=2026-08-01")).toBe(false);
  });

  it("rejects a tampered token", () => {
    const token = signPrintToken("from=2026-07-01");
    const tampered = token.slice(0, -2) + "xx";
    expect(verifyPrintToken(tampered, "from=2026-07-01")).toBe(false);
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T00:00:00Z"));
    const token = signPrintToken("from=2026-07-01", 1_000);
    vi.setSystemTime(new Date("2026-07-24T00:00:02Z")); // 2s later, past the 1s expiry
    expect(verifyPrintToken(token, "from=2026-07-01")).toBe(false);
  });

  it("rejects garbage input instead of throwing", () => {
    expect(verifyPrintToken("not-a-real-token", "from=2026-07-01")).toBe(false);
  });
});
