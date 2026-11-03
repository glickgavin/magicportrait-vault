import { defineConfig, devices } from "@playwright/test";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- plain ESM helper
import { appTestEnv } from "./scripts/local-env.mjs";

const PORT = 3100;
const env = appTestEnv(PORT) as Record<string, string>;
for (const [k, v] of Object.entries(env)) process.env[k] ??= v;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined },
  },
  projects: [
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: false, hasTouch: true } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  ],
  webServer: {
    command: process.env.E2E_PROD ? `pnpm build && pnpm start -p ${PORT}` : `pnpm dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: true,
    timeout: 240_000,
    env,
  },
});
