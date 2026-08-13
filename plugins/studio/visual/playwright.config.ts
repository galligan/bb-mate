import { defineConfig, devices } from "@playwright/test";

const inCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: ".",
  testMatch: "panel.visual.spec.ts",
  outputDir: "../dist/playwright/results",
  fullyParallel: false,
  forbidOnly: inCi,
  retries: inCi ? 1 : 0,
  workers: 1,
  reporter: "line",
  snapshotPathTemplate: "{testDir}/snapshots/{arg}{ext}",
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
      threshold: 0.25,
    },
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:61010/visual/",
    colorScheme: "light",
    contextOptions: { reducedMotion: "reduce" },
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "bunx vite --host 127.0.0.1 --port 61010 --strictPort",
    url: "http://127.0.0.1:61010/visual/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
