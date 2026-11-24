import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { admin, signInWithLink } from "./auth";
import { setSetting } from "./db";
import { expectNoAxeViolations } from "./helpers";

// Open store 5 (docs/open-store.md › Analytics and PostHog): what's recorded about a visitor, where, and what never is.
test.describe.configure({ mode: "serial" });

type Ev = { event: string; props: Record<string, unknown> };
const events = (page: Page) => page.evaluate(() => ((window as unknown as { __vaultEvents?: Ev[] }).__vaultEvents ?? []) as Ev[]);
const PILLOW = "8703000000";

test.describe("open store analytics", () => {
  test.beforeAll(async () => {
    await setSetting("open_store.enabled", true);
    await setSetting("open_store.generations_per_ip_per_day", 100000);
    await admin().from("rate_limits").delete().like("key", "store-%");
  });
  test.afterAll(async () => {
    await setSetting("open_store.enabled", false);
    await setSetting("open_store.generations_per_ip_per_day", 15);
  });

  test("first touch, business events under the visitor, replay masks, and no name or email in any event", async ({ page }) => {
    const NAME = `Zebrapet${Date.now() % 100000}`;
    const EMAIL = `store-private-${Date.now()}@example.com`;
    await page.goto(`/store?utm_source=klaviyo&utm_campaign=Ready%20email&utm_medium=email`);
    await expect.poll(async () => (await events(page)).map((e) => e.event)).toContain("page_view_store");
    await page.goto(`/store/product/${PILLOW}?from=grid`);
    await page.getByLabel("Choose a photo: Add their photo").setInputFiles({ name: "pet.jpg", mimeType: "image/jpeg", buffer: await sharp({ create: { width: 900, height: 900, channels: 3, background: "#c98a52" } }).jpeg().toBuffer() });
    await page.getByLabel("Their name (optional, shown on the picture)").fill(NAME);
    await page.getByTestId("store-create").click();
    const ask = page.getByTestId("store-email-ask");
    await ask.getByLabel("Your email").fill(EMAIL);
    await ask.getByRole("button", { name: "Email it to me" }).click();
    await expect(page.getByTestId("store-ready")).toBeVisible({ timeout: 20_000 });

    // Replay: the picture area, the photo slot and the email box are never recorded.
    await expect(page.getByTestId("store-stage")).toHaveClass(/ph-no-capture/);
    await expect(page.locator("canvas[data-preview]").first()).toHaveClass(/ph-no-capture/);

    // The first touch is on the visitor row: the landing's utm tags and path, from before the first photo.
    const gen = (await admin().from("store_generations").select("visitor_id").order("created_at", { ascending: false }).limit(1).single()).data!;
    const visitor = (await admin().from("store_visitors").select("first_touch, email").eq("id", gen.visitor_id).single()).data!;
    expect(visitor.first_touch).toMatchObject({ utm_source: "klaviyo", utm_campaign: "Ready email", utm_medium: "email", landing_path: "/store" });
    expect(visitor.email).toBeNull();

    // Business events before a proven email: email null, the visitor as the reference.
    const rows = (await admin().from("activity_log").select("event, email, ref_type, props").eq("ref_id", gen.visitor_id)).data!;
    expect(rows.map((r) => r.event)).toEqual(expect.arrayContaining(["store_photo_uploaded", "store_generation_started", "store_generation_ready", "store_email_given"]));
    for (const r of rows) {
      expect(r.email).toBeNull();
      expect(r.ref_type).toBe("store_visitor");
      expect(r.props).toMatchObject({ store_visitor_id: gen.visitor_id, area: "open_store" });
    }
    const started = rows.find((r) => r.event === "store_generation_started")!.props as Record<string, unknown>;
    expect(started).toMatchObject({ product_id: PILLOW, theme_slug: "admiral-01", photos: 1, has_name: true, attempt: 1 });

    // Never the name, the typed email, the photo or picture addresses, anywhere.
    const all = JSON.stringify([rows, await events(page)]);
    for (const s of [NAME, EMAIL, "/api/store/files/", "fixture://"]) expect(all).not.toContain(s);
    // A typed email never identifies anyone.
    expect((await admin().from("activity_log").select("id").eq("email", EMAIL)).data).toHaveLength(0);
  });

  test("Settings › Shop › Magic Store shows the numbers from our own tables", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/settings/shop/magic-store");
    const table = page.getByTestId("store-numbers");
    await expect(table).toBeVisible();
    const row = table.getByRole("row", { name: /Pictures started/ });
    await expect(row.getByRole("cell").first()).not.toHaveText("0");
    await expect(page.getByTestId("store-numbers-product")).toContainText("Magic Pillow with Photo");
    await expect(page.getByTestId("store-numbers-theme")).toContainText("The Admiral");
    await expect(page.getByTestId("store-numbers-channel")).toContainText("klaviyo");
    await expectNoAxeViolations(page);
  });
});
