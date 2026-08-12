import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/pages",
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4174/tolassist/",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-pages",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
