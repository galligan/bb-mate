import { defineConfig, devices } from "@playwright/test";

const inCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./dist/playwright/results",
  fullyParallel: false,
  forbidOnly: inCi,
  retries: inCi ? 1 : 0,
  workers: 1,
  reporter: inCi
    ? [
        ["line"],
        ["html", { outputFolder: "dist/playwright/report", open: "never" }],
      ]
    : "line",
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.001,
      threshold: 0.2,
    },
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:61000",
    colorScheme: "light",
    contextOptions: { reducedMotion: "reduce" },
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "bun run stories:preview -- --host 127.0.0.1 --port 61000",
      url: "http://127.0.0.1:61000/meta.json",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command:
        "bunx vite --config e2e/harness/vite.config.ts --host 127.0.0.1 --port 5173 --strictPort",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
