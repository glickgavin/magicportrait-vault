import { expect, test, type Page } from "@playwright/test";
import { admin, makeLink, signInWithLink } from "./auth";
import { deleteCardsOf, insertCard, setSetting } from "./db";
import { expectNoAxeViolations } from "./helpers";

async function cardsOf(email: string) {
  const r = await admin().from("cards").select("*, card_deliveries(*)").eq("sender_email", email).order("created_at", { ascending: false });
  return (r.data ?? []) as { id: string; public_id: string; share_slug: string; to_name: string; status: string; delivery: string; recipient_email: string | null; scheduled_for: string | null; flow: string; jpeg_path: string | null; card_deliveries: { type: string; status: string }[] }[];
}
async function clearDraft(page: Page) {
  await page.evaluate(() => sessionStorage.clear());
}

test.describe.configure({ mode: "serial" });

test.describe("card builder", () => {
  test.afterAll(async () => {
    await setSetting("cards.enabled", true);
    await setSetting("cards.who_can_create", "customers_with_order");
    await setSetting("cards.per_customer", "unlimited");
    await setSetting("cards.first_card_mode", "one_screen");
  });

  test("a /g link lands on FirstCard for someone with no cards; typing a name and tapping Create makes a card", async ({ page }) => {
    await deleteCardsOf("sam@example.com");
    await page.goto(await makeLink("sam@example.com", { purpose: "gift_offer" }));
    await expect(page).toHaveURL(/\/create\?entry=order_email$/);
    await clearDraft(page);
    await page.reload();
    await expect(page.getByTestId("first-card")).toBeVisible();
    await expect(page.getByRole("heading", { name: "We made you a card" })).toBeVisible();
    const create = page.getByTestId("create-card");
    await expect(create).toBeDisabled();
    await expect(page.getByLabel("Message")).not.toHaveValue("");
    await expectNoAxeViolations(page);
    await page.getByLabel("Who is it for?").fill("Grandma");
    await expect(create).toBeEnabled();
    await create.click();
    await page.waitForURL(/\/cards\/C-[0-9a-z]{6}\?new=1/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Your card is ready" })).toBeVisible();
    const [card] = await cardsOf("sam@example.com");
    expect(card).toMatchObject({ to_name: "Grandma", status: "ready", delivery: "self", flow: "first" });
    expect(card.jpeg_path).toBeTruthy();
    // the picture loads
    const img = page.getByRole("img", { name: "Your greeting card for Grandma" });
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 }).toBe(1500);
    await expectNoAxeViolations(page);
  });

  test("FirstCard: change design, photo, try another idea; email it adds one field", async ({ page }) => {
    await deleteCardsOf("sam@example.com");
    await signInWithLink(page, "sam@example.com", "/create");
    await clearDraft(page);
    await page.reload();
    const note = page.locator("p[aria-live=polite]").filter({ hasText: "·" }).first();
    const before = await note.innerText();
    await page.getByRole("button", { name: "Change design" }).click();
    await expect(note).not.toHaveText(before);
    await page.getByRole("button", { name: "Change design" }).click();
    await expect(page.getByRole("dialog", { name: "Pick a design" })).toBeVisible();
    await page.getByRole("dialog").getByRole("radio").first().click();
    await page.getByRole("button", { name: "Change photo" }).click();
    await page.getByRole("dialog").getByRole("radio").nth(2).click();
    const msg = await page.getByLabel("Message").inputValue();
    await page.getByRole("button", { name: "Try another" }).click();
    await expect(page.getByLabel("Message")).not.toHaveValue(msg);
    await page.getByLabel("Who is it for?").fill("Uncle Joe");
    await page.getByRole("radio", { name: /Email it for me/ }).check();
    await expect(page.getByRole("button", { name: /Create and send/ })).toBeDisabled();
    await expect(page.getByText("Pick a date")).toHaveCount(0); // no scheduling on the first card
    await page.getByLabel("Their email").fill("joe@example.com");
    await page.getByRole("button", { name: /Create and send/ }).click();
    await page.waitForURL(/\/cards\/C-/, { timeout: 30_000 });
    const [card] = await cardsOf("sam@example.com");
    expect(card).toMatchObject({ to_name: "Uncle Joe", delivery: "email", recipient_email: "joe@example.com" });
    expect(card.card_deliveries.some((d) => d.type === "email")).toBe(true);
  });

  test("someone with cards: /g link lands on step 1; full builder with email delivery scheduled", async ({ page }) => {
    await deleteCardsOf("rose@example.com");
    await insertCard("rose@example.com");
    await page.goto(await makeLink("rose@example.com", { purpose: "gift_offer" }));
    await clearDraft(page);
    await page.reload();
    await expect(page.getByTestId("step-theme")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What's the occasion?" })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole("tab", { name: /Birthdays/ }).click();
    await page.getByRole("radio", { name: /Birthday · Confetti/ }).click();
    await page.getByTestId("next").click();
    await expect(page.getByTestId("step-portrait")).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole("radio").nth(1).click();
    await page.getByRole("button", { name: "Adjust the photo" }).click();
    await page.getByLabel("Zoom").fill("1.5");
    await page.getByTestId("next").click();
    await expect(page.getByTestId("step-message")).toBeVisible();
    await expect(page.getByLabel("From", { exact: true })).toHaveValue("Rose");
    await expectNoAxeViolations(page);
    await page.getByLabel("To", { exact: true }).fill("Grandpa");
    await page.getByRole("button", { name: "Idea 2" }).click();
    await page.getByRole("radio", { name: /Email it for me/ }).check();
    await page.getByLabel("Their email").fill("grandpa@example.com");
    await page.getByRole("radio", { name: "Pick a date" }).check();
    const at = new Date(Date.now() + 3 * 86_400_000);
    const local = new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    await page.getByLabel("Date and time").fill(local);
    await page.getByTestId("create-card").click();
    await page.waitForURL(/\/cards\/C-/, { timeout: 30_000 });
    await expect(page.getByTestId("delivery-status")).toContainText("Sends");
    const [card] = await cardsOf("rose@example.com");
    expect(card).toMatchObject({ to_name: "Grandpa", status: "scheduled", delivery: "email", flow: "full" });
    expect(card.scheduled_for).toBeTruthy();
  });

  test("public card page, hidden link, and /try with UTM tags", async ({ page, request }) => {
    const [card] = await cardsOf("sam@example.com");
    await page.context().clearCookies();
    await page.goto(`/c/${card.share_slug}`);
    await expect(page.getByTestId("public-card")).toBeVisible();
    await expect(page.getByText("Sam sent you")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("sam@example.com");
    await expectNoAxeViolations(page);
    const res = await request.get(`/c/${card.share_slug}/try?via=page`, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    const loc = new URL(res.headers()["location"]);
    expect(loc.origin).toBe("https://magicportraits.ai");
    expect(Object.fromEntries(loc.searchParams)).toMatchObject({ utm_source: "greetingcard", utm_medium: "referral", card: card.public_id });
    const act = await admin().from("activity_log").select("email, actor, props").eq("event", "card_recipient_cta_tapped").order("id", { ascending: false }).limit(1).single();
    expect(act.data).toMatchObject({ email: "sam@example.com", actor: "recipient" });
    await admin().from("cards").update({ share_hidden: true }).eq("id", card.id);
    await page.goto(`/c/${card.share_slug}`);
    await expect(page.getByTestId("card-unavailable")).toContainText("This card is no longer available");
    expect((await request.get(`/c/${card.share_slug}/image`)).status()).toBe(404);
    await admin().from("cards").update({ share_hidden: false }).eq("id", card.id);
  });

  test("another person's card image is a 404", async ({ page }) => {
    const [card] = await cardsOf("sam@example.com");
    await signInWithLink(page, "rose@example.com", "/");
    expect((await page.request.get(`/api/cards/${card.id}/image`)).status()).toBe(404);
    expect((await page.goto(`/cards/${card.public_id}`))?.status()).toBe(404);
    const r = await page.request.post(`/api/cards/${card.id}/render`);
    expect(r.status()).toBe(404);
  });

  test("rules: paused, creators locked unless everyone_with_portrait, monthly limit", async ({ page }) => {
    await setSetting("cards.enabled", false);
    await signInWithLink(page, "rose@example.com", "/create");
    await expect(page.getByTestId("builder-paused")).toContainText("Cards are paused");
    expect((await page.request.post("/api/cards", { data: {} })).status()).toBe(400);
    await setSetting("cards.enabled", true);

    await page.context().clearCookies();
    await signInWithLink(page, "charlie@example.com", "/create");
    await expect(page.getByTestId("builder-locked")).toBeVisible();
    await setSetting("cards.who_can_create", "everyone_with_portrait");
    await page.goto("/create");
    await expect(page.getByTestId("first-card")).toBeVisible();
    await setSetting("cards.who_can_create", "customers_with_order");

    await page.context().clearCookies();
    await setSetting("cards.per_customer", "1");
    await signInWithLink(page, "rose@example.com", "/create");
    await expect(page.getByTestId("builder-limit")).toContainText("Your next card is available on");
    await setSetting("cards.per_customer", "unlimited");
  });

  test("the server rejects a portrait that isn't yours", async ({ page }) => {
    await signInWithLink(page, "rose@example.com", "/");
    const v = await admin().from("theme_versions").select("id").eq("status", "live").limit(1).single();
    const sams = "5e550001-0001-4000-8000-000000000001"; // Sam's portrait
    const r = await page.request.post("/api/cards", { data: { versionId: v.data!.id, imageId: sams, to: "X", from: "Y", message: "hi", delivery: "self" } });
    expect(r.status()).toBe(404);
  });
});
