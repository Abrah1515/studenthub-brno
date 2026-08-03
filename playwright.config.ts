import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000", trace: "retain-on-failure", screenshot: "only-on-failure", video: "off", locale: "cs-CZ" },
  projects: [
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } } },
    { name: "tablet-768", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 768, height: 1024 } } },
    { name: "mobile-390", use: { ...devices["Pixel 5"], channel: "chrome", viewport: { width: 390, height: 844 } } },
  ],
});
