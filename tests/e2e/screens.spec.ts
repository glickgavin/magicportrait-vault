import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { signInWithLink } from "./auth";

// Screenshots of every route at 390 px into docs/build-screens/ (fixture data only).
// Run: SCREENSHOTS=1 pnpm e2e --project=mobile tests/e2e/screens.spec.ts
test.skip(!process.env.SCREENSHOTS, "screenshots only on demand");
const out = process.env.SCREENSHOT_DIR || "docs/build-screens";
const only = process.env.SCREENS?.split(",");

const SHOTS: { name: string; as: string | null; path: string }[] = [
  { name: "signin", as: null, path: "/signin?purpose=gift" },
  { name: "redeem-entry", as: null, path: "/redeem/1001" },
  { name: "home-first", as: "sam@example.com", path: "/" },
  { name: "home-guest", as: "charlie@example.com", path: "/" },
  { name: "home-empty", as: "nobody@example.com", path: "/" },
  { name: "portraits", as: "sam@example.com", path: "/portraits" },
  { name: "portraits-rose", as: "rose@example.com", path: "/portraits" },
  { name: "create-theme", as: "rose@example.com", path: "/create?step=theme" },
  { name: "create-first", as: "charlie@example.com", path: "/create" },
];

for (const s of SHOTS) {
  if (only && !only.includes(s.name)) continue;
  test(`screen ${s.name}`, async ({ page }) => {
    mkdirSync(out, { recursive: true });
    if (s.as) await signInWithLink(page, s.as, s.path);
    else await page.goto(s.path);
    await page.goto(s.path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${s.name}.png`, fullPage: true });
  });
}
