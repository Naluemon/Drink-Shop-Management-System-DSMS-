import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Globs, not bare strings: bare strings match nothing here, so this list
    // was silently inert and the runner walked into sibling git worktrees
    // under .claude/worktrees/ and ran their vendored packages' tests.
    exclude: ["**/node_modules/**", "**/.next/**", "**/.claude/**", "e2e/**", "lib/generated/**"],
  },
});
