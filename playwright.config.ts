import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Dashboard/report totals and the refund queue are branch-wide (not scoped
  // per test fixture) against this shared dev database, so two specs selling
  // real POS transactions at the same time corrupt each other's revenue-delta
  // assertions — serialize the whole suite rather than chase per-file
  // isolation for a dozen-odd tests where the runtime cost is negligible.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- -p 3000",
    url: "http://localhost:3000/login",
    // Playwright's documented default. Reusing unconditionally has already
    // hidden a fatal build error behind a stale server on port 3000 from
    // another checkout and reported a whole e2e session as PASS.
    reuseExistingServer: !process.env.CI,
  },
});
