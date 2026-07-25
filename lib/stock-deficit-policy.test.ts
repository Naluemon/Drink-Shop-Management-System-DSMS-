import { describe, it, expect } from "vitest";
import { resolveStockDeficitPolicy } from "./stock-deficit-policy";

describe("resolveStockDeficitPolicy", () => {
  it("uses the per-ingredient override when set", () => {
    expect(resolveStockDeficitPolicy("strict_block", "warn_only")).toBe("strict_block");
    expect(resolveStockDeficitPolicy("warn_only", "strict_block")).toBe("warn_only");
  });

  it("falls back to the global policy when no override is set", () => {
    expect(resolveStockDeficitPolicy(null, "warn_only")).toBe("warn_only");
    expect(resolveStockDeficitPolicy(null, "strict_block")).toBe("strict_block");
  });
});
