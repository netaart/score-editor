import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 4310);

export default defineConfig({
  testDir: "e2e",
  reporter: "list",
  timeout: 20_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node e2e/serve.mjs",
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { E2E_PORT: String(port) },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // The stretch spec runs in the three engines the ticket names (Chromium, Firefox, WebKit); the phone profile leaves it out.
    { name: "phone", use: { ...devices["Pixel 7"] }, testIgnore: /stretch\.spec\.ts$/ },
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testMatch: /stretch\.spec\.ts$/ },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: /stretch\.spec\.ts$/ },
  ],
});
