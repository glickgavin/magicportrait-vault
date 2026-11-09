import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { admin, signInWithLink } from "./auth";
import { insertCard, setSetting } from "./db";
import { expectNoAxeViolations } from "./helpers";

test.describe.configure({ mode: "serial" });

const PAGES = ["/settings/insights", "/settings/customers", "/settings/cards", "/settings", "/settings/themes", "/settings/template", "/settings/redeem", "/settings/emails", "/settings/tracking", "/settings/data-sources", "/settings/super-users", "/settings/activity"];

test.describe("settings (super users)", () => {
  test.afterAll(async () => {
    await setSetting("cards.enabled", true);
  });

  test("every Settings page and admin API is a 404 for other people", async ({ page, request }) => {
    for (const p of PAGES) expect((await request.get(p)).status(), p).toBe(404);
    await signInWithLink(page, "sam@example.com", "/");
    for (const p of PAGES) expect((await page.request.get(p)).status(), p).toBe(404);
    for (const [method, url] of [
      ["post", "/api/admin/settings"],
      ["post", "/api/admin/super-users"],
      ["post", "/api/admin/data-sources/test"],
      ["post", "/api/admin/themes"],
      ["post", "/api/admin/versions"],
      ["post", "/api/admin/klaviyo/retry"],
      ["post", "/api/admin/emails/test"],
      ["post", "/api/admin/redeem/lookup"],
      ["post", "/api/admin/customers/search"],
      ["post", "/api/admin/cards/list"],
      ["post", "/api/admin/cards/export"],
    ] as const) {
      const r = await page.request[method](url, { data: {} });
      expect(r.status(), url).toBe(404);
    }
  });

  test("pages render for a super user and pass axe", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/");
    for (const p of PAGES) {
      expect((await page.request.get(p)).status(), p).toBe(200);
      await page.goto(p);
      await expect(page.locator("main h1").first()).toBeVisible();
      await expectNoAxeViolations(page, { exclude: ["iframe"] });
    }
  });

  test("changing a setting shows in history and changes behaviour", async ({ page }) => {
    await setSetting("cards.enabled", true);
    await signInWithLink(page, "super@example.com", "/settings");
    const sw = page.getByTestId("switch-cards.enabled").first();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    const hist = await admin().from("settings_history").select("old_value, new_value, changed_by").eq("key", "cards.enabled").order("id", { ascending: false }).limit(1).single();
    expect(hist.data).toEqual({ old_value: true, new_value: false, changed_by: "super@example.com" });
    const act = await admin().from("activity_log").select("props, actor").eq("event", "setting_changed").order("id", { ascending: false }).limit(1).single();
    expect(act.data).toEqual({ props: { key: "cards.enabled", section: "cards" }, actor: "super_user:super@example.com" });
    await page.goto("/create");
    await expect(page.getByTestId("builder-paused")).toBeVisible();
    await page.goto("/settings");
    await page.getByTestId("switch-cards.enabled").first().click();
    await expect(page.getByTestId("switch-cards.enabled").first()).toHaveAttribute("aria-checked", "true");
    // a typed value is validated
    await page.getByTestId("input-cards.message_max_chars").fill("abc");
    await page.getByTestId("row-cards.message_max_chars").getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("row-cards.message_max_chars").getByRole("alert")).toBeVisible();
  });

  test("super users: add, and you can't remove yourself", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/settings/super-users");
    await page.getByLabel("Email to add").fill("helper@example.com");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByTestId("super-users")).toContainText("helper@example.com");
    await page.getByRole("button", { name: "Remove helper@example.com" }).click();
    await expect(page.getByTestId("super-users")).not.toContainText("helper@example.com");
    const r = await page.request.post("/api/admin/super-users", { data: { action: "remove", email: "super@example.com" } });
    expect(r.status()).toBe(409);
  });

  test("data sources: Test all records results", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/settings/data-sources");
    await page.getByRole("button", { name: "Test all" }).click();
    await expect(page.getByTestId("source-shopify")).toContainText("OK", { timeout: 30_000 });
    await expect(page.getByTestId("source-lookup")).toContainText("warm_ms");
  });

  test("a theme version is published from uploaded files and appears in /create", async ({ page }) => {
    const dir = path.join(tmpdir(), "magic-vault", "e2e-uploads");
    mkdirSync(dir, { recursive: true });
    const bgFile = path.join(dir, "bg.jpg");
    const ovFile = path.join(dir, "overlay.png");
    writeFileSync(bgFile, await sharp({ create: { width: 1500, height: 2100, channels: 3, background: "#E3F0E8" } }).jpeg({ quality: 80 }).toBuffer());
    writeFileSync(
      ovFile,
      await sharp({ create: { width: 1500, height: 2100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: { create: { width: 1500, height: 60, channels: 4, background: { r: 184, g: 5, b: 159, alpha: 1 } } }, top: 0, left: 0 }])
        .png()
        .toBuffer(),
    );
    const theme = await admin().from("themes").select("id").eq("slug", "congratulations").single();
    const version = await admin().from("theme_versions").select("id").eq("theme_id", theme.data!.id).eq("slug", "confetti").single();
    await admin().from("theme_versions").update({ status: "draft" }).eq("id", version.data!.id);
    await signInWithLink(page, "super@example.com", `/settings/themes/${theme.data!.id}/versions/${version.data!.id}`);
    await expect(page.getByTestId("zone-photo")).toBeVisible();
    await page.getByTestId("upload-background").setInputFiles(bgFile);
    await expect(page.getByTestId("editor-message")).toContainText("Background checked and saved");
    await page.getByTestId("upload-overlay").setInputFiles(ovFile);
    await expect(page.getByTestId("editor-message")).toContainText("Overlay checked and saved");
    // A placeholder image for this design: used in the preview, then removed again.
    const sampleFile = path.join(dir, "placeholder.jpg");
    writeFileSync(sampleFile, await sharp({ create: { width: 600, height: 800, channels: 3, background: "#1990C6" } }).jpeg().toBuffer());
    await page.getByTestId("upload-sample").setInputFiles(sampleFile);
    await expect(page.getByTestId("editor-message")).toContainText("Placeholder image saved");
    await expect(page.getByTestId("sample-custom")).toHaveAttribute("aria-checked", "true");
    expect((await admin().from("theme_versions").select("sample_portrait_path").eq("id", version.data!.id).single()).data!.sample_portrait_path).toMatch(/sample-\d+\.jpg$/);
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("remove-sample").click();
    await expect(page.getByTestId("editor-message")).toContainText("Placeholder image removed");
    await expect(page.getByTestId("sample-custom")).toHaveCount(0);
    expect((await admin().from("theme_versions").select("sample_portrait_path").eq("id", version.data!.id).single()).data!.sample_portrait_path).toBeNull();
    // Preview hides every box; Edit brings them back.
    await page.getByTestId("mode-preview").click();
    await expect(page.getByTestId("zone-photo")).toHaveCount(0);
    await page.getByTestId("mode-edit").click();
    await expect(page.getByTestId("zone-photo")).toBeVisible();
    // Centre the "to" zone horizontally.
    await page.getByTestId("zone-to").click();
    await page.getByTestId("centre-zone").click();
    // Show / hide: hide the "from" line, then show it again.
    await page.getByTestId("zone-from").click();
    await page.getByTestId("zone-show").uncheck();
    await expect(page.getByTestId("zone-from")).toContainText("(hidden)");
    await page.getByTestId("zone-show").check();
    await expect(page.getByTestId("zone-from")).not.toContainText("(hidden)");
    await page.getByTestId("zone-to").click();
    // A Google Font for the "to" line: the preview loads it.
    await page.getByTestId("zone-font").selectOption("Great Vibes");
    await expect.poll(() => page.evaluate(() => document.fonts.check('40px "Great Vibes"')), { timeout: 10_000 }).toBe(true);
    // drag the photo zone a little
    const z = await page.getByTestId("zone-photo").boundingBox();
    await page.mouse.move(z!.x + 20, z!.y + 20);
    await page.mouse.down();
    await page.mouse.move(z!.x + 40, z!.y + 30, { steps: 4 });
    await page.mouse.up();
    await page.getByTestId("publish-version").click();
    await expect(page.getByTestId("editor-message")).toContainText("Published", { timeout: 30_000 });
    const v = await admin().from("theme_versions").select("status, thumbnail_path, background_path, overlay_path, layout").eq("id", version.data!.id).single();
    expect(v.data!.status).toBe("live");
    expect(v.data!.thumbnail_path).toMatch(/^congratulations\/confetti\/thumb-/);
    expect(v.data!.background_path).toMatch(/background-\d+\.jpg$/);
    expect((v.data!.layout as { photo: { x: number } }).photo.x).not.toBe(270);
    const to = (v.data!.layout as { canvas: { w: number }; text: { to: { x: number; w: number } } });
    expect(Math.abs(to.text.to.x + to.text.to.w / 2 - to.canvas.w / 2)).toBeLessThanOrEqual(1);
    expect((v.data!.layout as { text: { to: { font: string } } }).text.to.font).toBe("Great Vibes");
    expect(v.data!.overlay_path).toMatch(/overlay-\d+\.png$/);
    // Remove overlay (with a confirm): the design goes back to none.
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("remove-overlay").click();
    await expect(page.getByTestId("editor-message")).toContainText("Overlay removed");
    await expect(page.getByTestId("remove-overlay")).toHaveCount(0);
    expect((await admin().from("theme_versions").select("overlay_path").eq("id", version.data!.id).single()).data!.overlay_path).toBeNull();
    // A customer with cards sees it in step 1
    await page.context().clearCookies();
    await insertCard("rose@example.com");
    await signInWithLink(page, "rose@example.com", "/create?step=theme");
    await page.evaluate(() => sessionStorage.clear());
    await page.goto("/create?step=theme&category=general");
    await expect(page.getByRole("radio", { name: /Congratulations · Confetti/ })).toBeVisible();
  });

  test("insights, customer search and timeline, card detail is logged", async ({ page }) => {
    const card = await insertCard("rose@example.com", { to_name: "Grandma Rose" });
    await signInWithLink(page, "super@example.com", "/settings/insights?range=all");
    await expect(page.getByTestId("kpi-cards_created").getByTestId("kpi-value")).not.toHaveText("0");
    // What people did with their cards, and a value on each non-empty day's bar.
    await expect(page.getByTestId("card-actions")).toContainText("Emailed");
    await expect(page.getByTestId("card-actions")).toContainText("Made, nothing done yet");
    await expect(page.getByTestId("arrivals")).toContainText("Free gift offer email");
    await expect(page.getByTestId("arrivals-invoice")).toContainText("/from/invoice");
    await expect(page.getByTestId("cards-per-day").getByTestId("bar-value").filter({ hasText: /^\d+$/ }).first()).toBeAttached();
    await page.goto("/settings/customers");
    await page.getByLabel("Email or name").fill("rose@example.com");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByTestId("customer-results").getByRole("link").first().click();
    await expect(page).toHaveURL(/\/settings\/customers\/[0-9a-f-]{36}$/);
    expect(page.url()).not.toContain("rose");
    await expect(page.getByTestId("timeline")).toContainText("Order #1003");
    await page.getByRole("radio", { name: "Imagen" }).click();
    await expect(page.getByTestId("timeline").locator("li[data-source=shopify]")).toHaveCount(0);
    await page.goto(`/settings/cards?card=${card.public_id}`);
    await expect(page.getByTestId("card-detail")).toContainText("Test message");
    const viewed = await admin().from("activity_log").select("actor").eq("event", "admin_card_viewed").eq("ref_id", card.public_id);
    expect(viewed.data?.[0]?.actor).toBe("super_user:super@example.com");
    await page.getByTestId("toggle-share").click();
    await expect(page.getByTestId("toggle-share")).toHaveText("Show link");
    expect((await page.request.get(`/c/${card.share_slug}/image`)).status()).toBe(404);
    // a customer who isn't in our database yet is looked up live and gets a row
    await page.goto("/settings/customers");
    await page.getByLabel("Email or name").fill("charlie@example.com");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByTestId("customer-results")).toContainText("charlie@example.com");
  });

  test("theme library: the Live switch publishes every draft version, and turns the theme off", async ({ page }) => {
    const db = admin();
    const src = (await db.from("theme_versions").select("background_path, overlay_path, layout, message_ideas").eq("status", "live").limit(1).single()).data!;
    const cat = (await db.from("theme_categories").select("id").limit(1).single()).data!.id as string;
    const theme = (await db.from("themes").insert({ slug: `e2e-switch-${Date.now()}`, name: "E2E switch", category_id: cat, status: "draft" }).select("id").single()).data!.id as string;
    await db.from("theme_versions").insert([
      { theme_id: theme, slug: "one", name: "One", status: "draft", ...src },
      { theme_id: theme, slug: "two", name: "Two", status: "draft", ...src },
    ]);
    try {
      await signInWithLink(page, "super@example.com", "/settings/themes");
      const sw = page.getByTestId(`theme-live-${theme}`);
      await expect(sw).toHaveAttribute("aria-checked", "false");
      await expect(page.locator(`#live-desc-${theme}`)).toHaveText("0 of 2 live");
      await sw.click();
      await expect(sw).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
      await expect(page.locator(`#live-desc-${theme}`)).toHaveText("2 of 2 live");
      const vs = (await db.from("theme_versions").select("status").eq("theme_id", theme)).data!;
      expect(vs.every((v) => v.status === "live")).toBe(true);
      page.once("dialog", (d) => void d.accept());
      await sw.click();
      await expect(sw).toHaveAttribute("aria-checked", "false");
      expect((await db.from("themes").select("status").eq("id", theme).single()).data!.status).toBe("draft");
    } finally {
      await db.from("themes").delete().eq("id", theme);
    }
  });
});

test.describe("free gift offer email", () => {
  test("Don't email me offers: invalid link message, and the page passes axe", async ({ page }) => {
    await page.goto("/gift/unsubscribe?o=00000000-0000-4000-8000-000000000000");
    await expect(page.getByTestId("offer-unsubscribe")).toContainText("This link doesn't work any more");
    await expectNoAxeViolations(page);
  });
  test("Settings › Emails shows the offer email settings and numbers", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/settings/emails");
    const s = page.getByTestId("offer-email");
    await expect(s).toContainText("Free gift offer email");
    await expect(s).toContainText("Clicked");
    await expect(s).toContainText("gift.offer_email_channel");
  });
});
