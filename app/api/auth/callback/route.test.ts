import { describe, it, expect } from "vitest";
import { sanitizeNext } from "./route";

describe("sanitizeNext — open-redirect guard on ?next=", () => {
  it("allows a plain relative path", () => {
    expect(sanitizeNext("/reset-password")).toBe("/reset-password");
  });

  it("falls back to /dashboard when next is missing", () => {
    expect(sanitizeNext(null)).toBe("/dashboard");
  });

  it("rejects absolute URLs to another host", () => {
    expect(sanitizeNext("https://evil.com")).toBe("/dashboard");
    expect(sanitizeNext("http://evil.com/phish")).toBe("/dashboard");
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeNext("//evil.com")).toBe("/dashboard");
  });

  it("rejects paths that don't start with a single slash", () => {
    expect(sanitizeNext("evil.com")).toBe("/dashboard");
    expect(sanitizeNext("javascript:alert(1)")).toBe("/dashboard");
  });
});
