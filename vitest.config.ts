import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Globs (not plain strings) so these match at any depth — plain
    // "node_modules" doesn't stop vitest walking into other git worktrees'
    // own node_modules nested under .claude/worktrees/<name>/, which used to
    // sweep in thousands of vendored packages' own test suites.
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.claude/**",
      "**/e2e/**",
      "**/lib/generated/**",
    ],
  },
});
