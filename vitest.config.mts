import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    environment: "node",
    pool: "forks",
    testTimeout: 30000,
  },
});
