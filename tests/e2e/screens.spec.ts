import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { admin, signInWithLink } from "./auth";
import { deleteCardsOf, liveVersionId } from "./db";

// Screenshots of every route at 390 px into docs/build-screens/ (fixture data only).
// Run: SCREENSHOTS=1 pnpm e2e --project=mobile tests/e2e/screens.spec.ts
test.skip(!process.env.SCREENSHOTS, "screenshots only on demand");
test.describe.configure({ mode: "serial" });
const out = process.env.SCREENSHOT_DIR || "docs/build-screens";
const only = process.env.SCREENS?.split(",");

async function makeCard(page: Page, to: string, delivery: "self" | "email", scheduled = false) {
  const { versionId } = await liveVersionId("christmas-snowfall");
  const r = await page.request.post("/api/cards", {
    data: {
      versionId,
      imageId: "5e550002-0002-4000-8000-000000000001",
      to,
      from: "Rose",
      message: "Merry Christmas! Luna put on her best smile just for you.",
      delivery,
      recipientEmail: delivery === "email" ? "grandma@example.com" : undefined,
      scheduledFor: scheduled ? new Date(Date.now() + 20 * 86_400_000).toISOString() : null,
      entryPoint: "home",
    },
  });
  const { id, publicId } = (await r.json()) as { id: string; publicId: string };
  await page.request.post(`/api/cards/${id}/render`, { data: {} });
  return { id, publicId };
}

async function shot(page: Page, name: string, path: string) {
  if (only && !only.includes(name)) return;
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}

test("customer screens", async ({ page, request }) => {
  test.setTimeout(240_000);
  mkdirSync(out, { recursive: true });
  await request.post("/api/test/reset-fixtures");
  await shot(page, "01-signin", "/signin?purpose=gift");
  await shot(page, "02-redeem-entry", "/redeem/1001");

  await deleteCardsOf("sam@example.com");
  await signInWithLink(page, "sam@example.com", "/");
  await page.evaluate(() => sessionStorage.clear());
  await shot(page, "03-home-first", "/");
  await shot(page, "04-first-card", "/create");
  await shot(page, "05-portraits", "/portraits");
  await shot(page, "06-orders", "/orders");
  await shot(page, "07-order-detail-mug", "/orders/1001");
  await shot(page, "08-order-detail-locked", "/orders/1002");
  await shot(page, "09-order-not-found", "/orders/999999");

  await page.context().clearCookies();
  await deleteCardsOf("rose@example.com");
  await signInWithLink(page, "rose@example.com", "/");
  const ready = await makeCard(page, "Grandma Rose", "email");
  await makeCard(page, "The Cohens", "email", true);
  const shared = await makeCard(page, "Dad", "self");
  await page.evaluate(() => sessionStorage.clear());
  await shot(page, "10-home", "/");
  await shot(page, "11-create-theme", "/create?step=theme");
  const { versionId } = await liveVersionId("christmas-snowfall");
  await shot(page, "12-create-portrait", `/create/portrait?v=${versionId}&image=5e550002-0002-4000-8000-000000000001`);
  await shot(page, "13-create-message", `/create/message?v=${versionId}&image=5e550002-0002-4000-8000-000000000001`);
  await shot(page, "14-card-ready", `/cards/${ready.publicId}`);
  await shot(page, "15-my-cards", "/cards");
  await shot(page, "16-portraits-rose", "/portraits");
  const slug = (await admin().from("cards").select("share_slug").eq("public_id", shared.publicId).single()).data!.share_slug as string;
  const d = (await admin().from("card_deliveries").select("id").eq("card_id", ready.id).limit(1).single()).data?.id as string;
  const readySlug = (await admin().from("cards").select("share_slug").eq("id", ready.id).single()).data!.share_slug as string;

  const anon = await (await page.context().browser()!.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await shot(anon, "17-public-card", `/c/${slug}`);
  await shot(anon, "18-unsubscribe", `/c/${readySlug}/unsubscribe?d=${d}`);

  await page.context().clearCookies();
  await signInWithLink(page, "charlie@example.com", "/");
  await shot(page, "19-home-guest", "/");
  await shot(page, "20-create-locked", "/create");
  await page.context().clearCookies();
  await signInWithLink(page, "nobody@example.com", "/");
  await shot(page, "21-home-empty", "/");
  await page.getByTestId("menu-button").click();
  await page.waitForTimeout(400);
  if (!only || only.includes("22-menu")) await page.screenshot({ path: `${out}/22-menu.png` });
});

test("settings screens", async ({ page }) => {
  test.setTimeout(240_000);
  mkdirSync(out, { recursive: true });
  await signInWithLink(page, "super@example.com", "/");
  const theme = (await admin().from("themes").select("id").eq("slug", "christmas").single()).data!.id as string;
  const version = (await admin().from("theme_versions").select("id").eq("theme_id", theme).eq("slug", "snowfall").single()).data!.id as string;
  const member = (await admin().from("vault_members").select("id").eq("email", "rose@example.com").single()).data!.id as string;
  const card = (await admin().from("cards").select("public_id").eq("sender_email", "rose@example.com").limit(1).single()).data?.public_id as string;
  const pages: [string, string][] = [
    ["30-settings-insights", "/settings/insights?range=all"],
    ["31-settings-customers", "/settings/customers"],
    ["32-settings-customer", `/settings/customers/${member}`],
    ["33-settings-cards", `/settings/cards?card=${card}`],
    ["34-settings-general", "/settings"],
    ["35-settings-themes", "/settings/themes"],
    ["36-settings-template-editor", `/settings/themes/${theme}/versions/${version}`],
    ["37-settings-redeem", "/settings/redeem"],
    ["38-settings-emails", "/settings/emails"],
    ["39-settings-tracking", "/settings/tracking"],
    ["40-settings-data-sources", "/settings/data-sources"],
    ["41-settings-super-users", "/settings/super-users"],
    ["42-settings-activity", "/settings/activity"],
  ];
  for (const [name, path] of pages) await shot(page, name, path);
});
