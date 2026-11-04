import { expect, test, type Page } from "@playwright/test";
import { admin, signInWithLink } from "./auth";
import { deleteCardsOf, insertCard, liveVersionId, setSetting } from "./db";

type Ev = { event: string; props: Record<string, unknown> };
const events = (page: Page) => page.evaluate(() => ((window as unknown as { __vaultEvents?: Ev[] }).__vaultEvents ?? []) as Ev[]);
async function expectEvent(page: Page, name: string, path: string) {
  await expect.poll(async () => (await events(page)).map((e) => e.event), { message: `${path} should fire ${name}`, timeout: 10_000 }).toContain(name);
}
async function visit(page: Page, path: string, name: string) {
  await page.goto(path);
  await expectEvent(page, name, path);
}

test.describe.configure({ mode: "serial" });

test.describe("analytics", () => {
  test.beforeAll(async ({ request }) => {
    await request.post("/api/test/reset-fixtures");
    await setSetting("cards.enabled", true);
  });

  test("every customer page fires its page_view_*", async ({ page, browser }) => {
    await visit(page, "/signin", "page_view_vault_signin");
    await visit(page, "/redeem/1001", "page_view_redeem");

    await deleteCardsOf("sam@example.com");
    await signInWithLink(page, "sam@example.com", "/");
    await expectEvent(page, "page_view_vault_home_first", "/");
    await visit(page, "/portraits", "page_view_vault_portraits");
    await visit(page, "/orders", "page_view_vault_orders");
    await visit(page, "/orders/1001", "page_view_vault_order");
    await visit(page, "/create", "page_view_card_first");
    await visit(page, "/create?step=theme", "page_view_card_theme");
    const { versionId } = await liveVersionId();
    await visit(page, `/create/portrait?v=${versionId}`, "page_view_card_portrait");
    await visit(page, `/create/message?v=${versionId}&image=5e550001-0001-4000-8000-000000000001`, "page_view_card_message");
    await visit(page, "/cards", "page_view_vault_cards");

    await deleteCardsOf("rose@example.com");
    const card = await insertCard("rose@example.com", { jpeg_path: null, status: "rendering" });
    await page.context().clearCookies();
    await signInWithLink(page, "rose@example.com", "/");
    await expectEvent(page, "page_view_vault_home", "/ (has cards)");
    await page.goto(`/create/creating/${card.id}`);
    await expectEvent(page, "page_view_card_creating", "/create/creating");
    await page.waitForURL(/\/cards\/C-/, { timeout: 30_000 });
    await expectEvent(page, "page_view_card_ready", "/cards/[publicId]");

    const other = await (await browser.newContext()).newPage();
    await visit(other, `/c/${card.share_slug}`, "page_view_card_received");
    await visit(other, `/c/${card.share_slug}/unsubscribe?d=00000000-0000-4000-8000-000000000000`, "page_view_card_unsubscribe");

    await page.context().clearCookies();
    await signInWithLink(page, "charlie@example.com", "/");
    await expectEvent(page, "page_view_vault_guest", "/ (creator)");
    await page.context().clearCookies();
    await signInWithLink(page, "nobody@example.com", "/");
    await expectEvent(page, "page_view_vault_empty", "/ (nobody)");
  });

  test("every Settings page fires settings_viewed", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/");
    const theme = await admin().from("themes").select("id").eq("slug", "christmas").single();
    const version = await admin().from("theme_versions").select("id").eq("theme_id", theme.data!.id).limit(1).single();
    const member = await admin().from("vault_members").select("id").eq("email", "rose@example.com").single();
    for (const p of [
      "/settings/insights",
      "/settings/customers",
      "/settings/cards",
      "/settings",
      "/settings/themes",
      "/settings/template",
      `/settings/themes/${theme.data!.id}/versions/${version.data!.id}`,
      "/settings/redeem",
      "/settings/emails",
      "/settings/tracking",
      "/settings/data-sources",
      "/settings/super-users",
      "/settings/activity",
    ]) {
      await visit(page, p, "settings_viewed");
      const last = (await events(page)).filter((e) => e.event === "settings_viewed").pop()!;
      expect(typeof last.props.section, p).toBe("string");
    }
    const viewed = await admin().from("activity_log").select("id").eq("event", "admin_customer_viewed").limit(1);
    expect(member.data?.id).toBeTruthy();
    expect(viewed.error).toBeNull();
  });

  test("signed-in pages identify the person by email with the person properties", async ({ page }) => {
    await signInWithLink(page, "sam@example.com", "/portraits");
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __vaultIdentity?: Record<string, unknown> }).__vaultIdentity))
      .toMatchObject({ email: "sam@example.com", is_customer: true, session_count: expect.any(Number), cards_created: expect.any(Number) });
  });

  test("no message text, recipient name or recipient email appears in any captured event", async ({ page }) => {
    const MESSAGE = `Zebra unique message ${Date.now()}`;
    const TO = `Recipientname${Date.now() % 100000}`;
    const RECIPIENT = `rcpt${Date.now()}@example.com`;
    await setSetting("klaviyo.enabled", true);
    await signInWithLink(page, "rose@example.com", "/create?step=theme");
    await page.evaluate(() => sessionStorage.clear());
    await page.goto("/create?step=theme");
    for (const step of ["step-theme", "step-portrait"]) {
      const radio = page.getByTestId(step).getByRole("radio").first();
      await expect(async () => {
        await radio.click();
        await expect(radio).toHaveAttribute("aria-checked", "true", { timeout: 1000 });
      }).toPass({ timeout: 20_000 });
      await page.getByTestId("next").click();
    }
    await page.getByLabel("To", { exact: true }).fill(TO);
    await page.getByLabel("Message", { exact: true }).fill(MESSAGE);
    await page.getByTestId("create-card").click();
    await page.waitForURL(/\/cards\/C-/, { timeout: 30_000 });
    // Sent from the ready screen (create first, then send).
    await page.getByLabel("Their email address").fill(RECIPIENT);
    await page.getByTestId("send-card").click();
    await expect(page.getByTestId("send-box")).toContainText("Sent to");
    await page.getByTestId("copy-link").click();
    // Session replay never sees the card (it shows the message)
    await expect(page.locator("img.ph-no-capture")).toHaveCount(1);
    await page.goto("/cards");
    await expect(page.locator("[data-testid=my-card] img").first()).toHaveClass(/ph-no-capture/);
    await setSetting("klaviyo.enabled", false);

    const browserEvents = JSON.stringify(await events(page));
    for (const s of [MESSAGE, TO, RECIPIENT]) expect(browserEvents).not.toContain(s);
    const since = new Date(Date.now() - 5 * 60_000).toISOString();
    const acts = await admin().from("activity_log").select("props").gte("occurred_at", since).limit(2000);
    const outbox = await admin().from("outbound_events").select("payload").gte("created_at", since).limit(2000);
    const stored = JSON.stringify([acts.data, outbox.data]);
    expect(stored).toContain("card_created");
    for (const s of [MESSAGE, TO, RECIPIENT]) expect(stored).not.toContain(s);
  });
});
