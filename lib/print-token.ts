import { createHmac, randomBytes } from "crypto";

// Phase 11 — Reports. DECISIONS.md D10: PDF export renders via headless
// Chromium navigating to our own internal /reports/print/* route (so it gets
// the exact same self-hosted Thai fonts + CSS as the live site — see D10's
// "PDF แสดงภาษาไทยถูกต้อง 100%" requirement). That route can't require a normal
// login session (the headless browser has no user cookies), so instead the
// server action that already checked the actor's permission mints a
// short-lived signed token, and the print route accepts ONLY that token.
//
// Secret is process-local and regenerated on every restart — good enough
// since tokens live for well under a minute and are only ever consumed by
// our own server's own headless browser instance, never a real client.
const SECRET = randomBytes(32).toString("hex");

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("hex");
}

export function signPrintToken(payload: string, expiresInMs = 60_000): string {
  const exp = Date.now() + expiresInMs;
  const data = `${payload}.${exp}`;
  return Buffer.from(`${data}.${sign(data)}`).toString("base64url");
}

export function verifyPrintToken(token: string, expectedPayload: string): boolean {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const lastDot = decoded.lastIndexOf(".");
    const secondLastDot = decoded.lastIndexOf(".", lastDot - 1);
    const data = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const payload = decoded.slice(0, secondLastDot);
    const expStr = decoded.slice(secondLastDot + 1, lastDot);

    if (payload !== expectedPayload) return false;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    return sig === sign(data);
  } catch {
    return false;
  }
}
