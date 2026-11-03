import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { admin, signInWithLink } from "./auth";
import { insertCard, setSetting } from "./db";
import { expectNoAxeViolations } from "./helpers";

test.describe.configure({ mode: "serial" });

const PAGES = ["/settings", "/settings/themes", "/settings/template", "/settings/redeem", "/settings/emails", "/settings/tracking", "/settings/data-sources", "/settings/super-users", "/settings/activity"];

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
    // A customer with cards sees it in step 1
    await page.context().clearCookies();
    await insertCard("rose@example.com");
    await signInWithLink(page, "rose@example.com", "/create?step=theme");
    await page.evaluate(() => sessionStorage.clear());
    await page.goto("/create?step=theme&category=general");
    await expect(page.getByRole("radio", { name: /Congratulations · Confetti/ })).toBeVisible();
  });
});
