// Lighthouse (mobile) on signed-in pages, using Playwright's Chromium with a debugging port.
// Run against the production server on :3100: node scripts/lighthouse.mjs
import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";
import { createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { appTestEnv } from "./local-env.mjs";

const env = appTestEnv(3100);
const base = "http://localhost:3100";
const PORT = 9333;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function link(email) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHmac("sha256", env.GIFT_LINK_SECRET).update(token).digest("hex");
  await admin.from("signin_links").insert({ token_hash: hash, email, purpose: "admin_resend", redirect_path: "/", expires_at: new Date(Date.now() + 3600_000).toISOString() });
  return `${base}/g/${token}`;
}

const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(await link(process.env.LH_EMAIL || "rose@example.com"));
await page.waitForURL((u) => !u.pathname.startsWith("/g/"));

const results = [];
for (const path of (process.env.LH_PATHS || "/,/create?step=theme,/orders").split(",")) {
  const r = await lighthouse(`${base}${path}`, { port: PORT, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility"], formFactor: "mobile", disableStorageReset: true, screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2, disabled: false } });
  const c = r.lhr.categories;
  const row = { path, performance: Math.round(c.performance.score * 100), accessibility: Math.round(c.accessibility.score * 100), lcp_ms: Math.round(r.lhr.audits["largest-contentful-paint"].numericValue), tbt_ms: Math.round(r.lhr.audits["total-blocking-time"].numericValue), cls: r.lhr.audits["cumulative-layout-shift"].numericValue.toFixed(3) };
  const failing = Object.values(r.lhr.audits).filter((a) => a.score !== null && a.score < 1 && r.lhr.categories.accessibility.auditRefs.some((x) => x.id === a.id && x.weight > 0)).map((a) => a.id);
  results.push({ ...row, a11y_issues: failing.join(" ") });
}
await browser.close();
console.table(results);
const bad = results.filter((r) => r.performance < 85 || r.accessibility < 95);
if (bad.length) {
  console.error("Below target (performance ≥ 85, accessibility ≥ 95)");
  process.exit(1);
}
