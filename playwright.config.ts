import { defineConfig } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1600, height: 1000 }, trace: "retain-on-failure" },
  webServer: {
    command: `npm run seed && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { DATA_DIR: "./data/e2e", DEMO_MODE: "1", ACCOUNTING_ADAPTER: "mock" },
  },
});
