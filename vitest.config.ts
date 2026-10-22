import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Vitest's default excludes don't cover .next — without this, running
    // `pnpm build` before `pnpm test` picks up the standalone output's
    // copy of tests/ too and silently doubles the suite.
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
