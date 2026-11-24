import { readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { admin, signInWithLink } from "./auth";
import { setSetting } from "./db";
import { expectNoAxeViolations } from "./helpers";

// The open store's cart, checkout, sign-in linking and the email while painting (docs/open-store.md, Open store 4),
// against the fixtures: the Shopify cart is the in-memory fixture cart; emails are written to the outbox folder.
test.describe.configure({ mode: "serial" });

const PILLOW = "8703000000";
const MUG = "8702000000";
const OUTBOX = process.env.EMAIL_OUTBOX_DIR || path.join(tmpdir(), "magic-vault", "sent-emails");
const mailsTo = (to: string) => {
  let files: string[] = [];
  try {
    files = readdirSync(OUTBOX).sort();
  } catch {
    return [];
  }
  return files.map((f) => JSON.parse(readFileSync(path.join(OUTBOX, f), "utf8")) as { to: string; subject: string; html: string }).filter((m) => m.to === to);
};
const unique = (who: string) => `${who}-${Date.now().toString(36)}@example.com`;

async function makePicture(page: Page, product = PILLOW, name = "Teddy") {
  await page.goto(`/store/product/${product}`);
  await page.getByLabel("Choose a photo: Add their photo").setInputFiles({ name: "pet.jpg", mimeType: "image/jpeg", buffer: await sharp({ create: { width: 900, height: 900, channels: 3, background: "#c98a52" } }).jpeg().toBuffer() });
  await page.getByLabel("Their name (optional, shown on the picture)").fill(name);
  await page.getByTestId("store-create").click();
}

test.describe("open store cart, sign-in and email", () => {
  test.beforeAll(async () => {
    await setSetting("open_store.enabled", true);
    await setSetting("open_store.generations_per_ip_per_day", 100000);
    await admin().from("rate_limits").delete().like("key", "store-%");
  });
  test.afterAll(async () => {
    await setSetting("open_store.enabled", false);
    await setSetting("open_store.generations_per_ip_per_day", 15);
  });

  test("add to cart: the drawer with the preview, quantity, remove, subtotal and checkout to Shopify", async ({ page }) => {
    await makePicture(page);
    await expect(page.getByTestId("store-ready")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("store-add").click();
    const drawer = page.getByRole("dialog", { name: "Your cart" });
    await expect(drawer).toBeVisible();
    const line = drawer.getByTestId("store-cart-line");
    await expect(line).toHaveCount(1);
    await expect(line).toContainText("Magic Pillow with Photo");
    await expect.poll(() => line.locator("img").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    await expect(drawer.getByTestId("store-cart-subtotal")).toHaveText("$59.99");
    await expectNoAxeViolations(page);

    await line.getByRole("button", { name: "One more" }).click();
    await expect(line.getByTestId("store-cart-qty")).toHaveText("2");
    await expect(drawer.getByTestId("store-cart-subtotal")).toHaveText("$119.98");
    await drawer.getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("store-cart-button")).toHaveAccessibleName("Cart, 2 items");

    // The count survives a reload (the cart is Shopify's, its id on the visitor row).
    await page.reload();
    await expect(page.getByTestId("store-cart-button")).toHaveAccessibleName("Cart, 2 items");
    const visitor = (await admin().from("store_visitors").select("shopify_cart_id").not("shopify_cart_id", "is", null).order("created_at", { ascending: false }).limit(1).single()).data!;
    expect(visitor.shopify_cart_id).toMatch(/^gid:\/\/shopify\/Cart\//);

    await page.getByTestId("store-cart-button").click();
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(drawer.getByText("Your cart is empty.")).toBeVisible();
    await drawer.getByRole("button", { name: "Close" }).click();

    // Checkout goes to Shopify's own checkout link.
    await page.getByTestId("store-add").click();
    await page.route("https://fixtures.myshopify.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>Checkout</title>checkout" }));
    await drawer.getByTestId("store-checkout").click();
    await page.waitForURL(/fixtures\.myshopify\.com\/cart\/c\//);
  });

  test("another visitor can't touch this cart or its previews", async ({ page, browser }) => {
    await makePicture(page);
    await expect(page.getByTestId("store-ready")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("store-add").click();
    const preview = await page.getByTestId("store-cart-line").locator("img").getAttribute("src");
    const gen = (await admin().from("store_generations").select("id").order("created_at", { ascending: false }).limit(1).single()).data!;
    const s = await (await browser.newContext()).newPage();
    await s.goto(`/store/product/${PILLOW}`);
    expect((await s.request.get(preview!)).status()).toBe(404);
    expect((await s.request.post("/api/store/cart/lines", { data: { generationId: gen.id, variantId: "gid://shopify/ProductVariant/8703000001", quantity: 1 } })).status()).toBe(404);
    const theirCart = await (await s.request.get("/api/store/cart")).json();
    expect(theirCart.cart.lines).toHaveLength(0);
    await s.context().close();
  });

  test("signing in links the visitor; a second browser signed in as them sees the picture, the photo and the cart", async ({ browser }) => {
    const email = unique("store-sam");
    const a = await (await browser.newContext()).newPage();
    await makePicture(a, PILLOW, "Bo");
    await expect(a.getByTestId("store-ready")).toBeVisible({ timeout: 20_000 });
    await a.getByTestId("store-add").click();
    await expect(a.getByTestId("store-cart-line")).toHaveCount(1);
    // Signing in from the store, then any store page: this browser's visitor is linked to the email.
    await signInWithLink(a, email, `/store/product/${PILLOW}`);
    await expect.poll(async () => (await admin().from("store_visitors").select("linked_via").eq("email", email)).data?.[0]?.linked_via).toBe("sign_in");

    const b = await (await browser.newContext()).newPage();
    await signInWithLink(b, email, `/store/product/${PILLOW}`);
    await expect(b.getByTestId("store-ready")).toBeVisible();
    await expect(b.getByTestId("store-cart-button")).toHaveAccessibleName("Cart, 1 item");
    await b.goto(`/store/product/${MUG}`);
    await expect(b.getByTestId("earlier-photos")).toBeVisible();
    await a.context().close();
    await b.context().close();
  });

  test("a shared device: signing in as someone else starts a fresh visitor, and the first person's pictures stay theirs", async ({ browser }) => {
    const first = unique("store-first");
    const second = unique("store-second");
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await makePicture(page, PILLOW, "Pip");
    await expect(page.getByTestId("store-ready")).toBeVisible({ timeout: 20_000 });
    await signInWithLink(page, first, `/store/product/${PILLOW}`);
    await expect.poll(async () => (await admin().from("store_visitors").select("id").eq("email", first)).data?.length).toBe(1);
    const before = (await ctx.cookies()).find((c) => c.name === "mmp_visitor")!.value;

    await ctx.clearCookies({ name: /^sb-/ });
    await signInWithLink(page, second, `/store/product/${PILLOW}`);
    const after = (await ctx.cookies()).find((c) => c.name === "mmp_visitor")!.value;
    expect(after).not.toBe(before);
    await expect(page.getByTestId("store-ready")).toHaveCount(0);
    expect((await admin().from("store_visitors").select("id").eq("email", second)).data).toHaveLength(0);
    await ctx.close();
  });

  test("the email while painting: sent when ready, its link opens the picture in a fresh browser and links the visitor", async ({ page, browser }) => {
    test.slow();
    const email = unique("store-mail");
    await makePicture(page, PILLOW, "Slowpoke");
    const ask = page.getByTestId("store-email-ask");
    await expect(ask).toContainText("While we paint: want Slowpoke's picture by email?");
    await ask.getByLabel("Your email").fill(email);
    await ask.getByLabel("Send me offers and new designs too. Unsubscribe any time.").check();
    await ask.getByRole("button", { name: "Email it to me" }).click();
    await expect(page.getByText("We'll email it to you the moment it's ready.")).toBeVisible();
    expect(mailsTo(email)).toHaveLength(0);

    await expect(page.getByTestId("store-ready")).toContainText("We've emailed it to you too.", { timeout: 40_000 });
    await expect.poll(() => mailsTo(email).length).toBe(1);
    const mail = mailsTo(email)[0];
    expect(mail.subject).toBe("Slowpoke's picture is ready");
    const link = /href="[^"]*?(\/g\/[A-Za-z0-9_-]{43})"/.exec(mail.html)?.[1];
    expect(link).toBeTruthy();
    // The address was typed, not proven: nothing is linked until the link is used.
    expect((await admin().from("store_visitors").select("id").eq("email", email)).data).toHaveLength(0);
    // Ticked: a subscription and the Store Picture Ready event wait in the outbox (Klaviyo is off in tests).
    const outbox = (await admin().from("outbound_events").select("kind, event_name, payload").eq("email", email)).data!;
    expect(outbox.map((o) => o.kind).sort()).toEqual(["event", "subscription"]);
    expect(JSON.stringify(outbox)).not.toContain("Slowpoke");

    const fresh = await (await browser.newContext()).newPage();
    await fresh.goto(link!);
    await fresh.waitForURL(/\/store\/product\/8703000000\?g=[0-9a-f-]{36}&from=email_link$/);
    await expect(fresh.getByTestId("store-ready")).toBeVisible();
    expect((await admin().from("store_visitors").select("linked_via").eq("email", email)).data?.[0]?.linked_via).toBe("email_link");
    await fresh.context().close();
  });
});
