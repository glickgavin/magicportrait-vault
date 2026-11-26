import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { admin } from "./auth";
import { setSetting } from "./db";
import { expectNoAxeViolations } from "./helpers";

// Making a picture in the open store (docs/open-store.md › Creating the picture), against the Imagen fixtures:
// the pet's name picks the case ("Oops" fails, "Slowpoke" is slow, "Forever" never finishes). Fresh browser
// contexts are fresh visitors. Every setting changed here is put back.
test.describe.configure({ mode: "serial" });

const PILLOW = "8703000000";
const MUG = "8702000000";
const ACRYLIC = "8705000000";

const photo = (w = 900, h = 900) => sharp({ create: { width: w, height: h, channels: 3, background: "#c98a52" } }).jpeg().toBuffer();

async function addPhoto(page: Page, label = "Their photo") {
  await page.getByLabel(`Choose a photo: ${label}`).setInputFiles({ name: "pet.jpg", mimeType: "image/jpeg", buffer: await photo() });
}

/** "Change photo" (or "Choose another photo" after a failure) opens the sheet; a new photo is uploaded there. */
async function uploadInSheet(page: Page) {
  const sheet = page.getByTestId("store-photo-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Upload a new photo").setInputFiles({ name: "pet2.jpg", mimeType: "image/jpeg", buffer: await photo(1000, 1000) });
  await expect(sheet).toHaveCount(0);
}

async function createPicture(page: Page, name: string) {
  await addPhoto(page);
  await page.getByLabel("Their name (optional, shown on the picture)").fill(name);
  await page.getByTestId("store-create").click();
}

const DEFAULTS = { "open_store.slow_after_s": 90, "open_store.timeout_s": 240, "open_store.generations_per_visitor_per_day": 5, "open_store.generations_per_ip_per_day": 15 } as const;

test.describe("open store pictures", () => {
  test.beforeAll(async () => {
    await setSetting("open_store.enabled", true);
    // Every test here comes from the same IP; the per-IP limit is tested on its own below.
    await setSetting("open_store.generations_per_ip_per_day", 100000);
    await admin().from("store_visitors").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await admin().from("rate_limits").delete().like("key", "store-gen-ip:%");
  });
  test.afterAll(async () => {
    await setSetting("open_store.enabled", false);
    for (const [k, v] of Object.entries(DEFAULTS)) await setSetting(k, v);
  });

  test("ready: steps, their picture on the pillow, pick a favourite, more gifts with it, and it's back on return", async ({ page }) => {
    await page.goto(`/store/product/${PILLOW}`);
    const cookie = (await page.context().cookies()).find((c) => c.name === "mmp_visitor");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // No visitor row yet: a page view leaves nothing behind.
    expect((await admin().from("store_visitors").select("id")).data).toHaveLength(0);

    await createPicture(page, "Teddy");
    const creating = page.getByTestId("store-creating");
    await expect(creating).toBeVisible();
    await expect(creating).toContainText("Painting Teddy as The Admiral");
    // Phones: the progress is where they added their photo (scrolled to), not up in the gallery; desktop: over the gallery.
    const inGallery = page.getByTestId("store-stage").getByTestId("store-creating");
    if (test.info().project.name === "mobile") {
      await expect(inGallery).toHaveCount(0);
      await expect(creating).toBeInViewport();
    } else await expect(inGallery).toBeVisible();
    await expect(page.getByTestId("store-create")).toHaveText("Creating their picture…");

    await expect(page.getByTestId("store-ready")).toContainText("Teddy is ready", { timeout: 20_000 });
    await expect(page.getByTestId("store-stage").locator("canvas[data-preview]")).toBeVisible();
    await expect(page.getByTestId("store-add")).toContainText("Add to cart · $59.99");
    const results = page.locator(":is([data-testid=store-results],[data-testid=store-results-desktop]):visible");
    await expect(results.getByRole("radio")).toHaveCount(2);
    const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/api/store/generations/"));
    await results.getByRole("radio", { name: "Picture 2" }).click();
    expect((await saved).status()).toBe(200);
    await expect(results.getByRole("radio", { name: "Picture 2" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("heading", { name: "Teddy on more gifts" })).toBeVisible();
    const cards = page.getByTestId("store-related-card");
    await expect(cards.first().locator("canvas")).toBeVisible();
    await expectNoAxeViolations(page);

    // The saved row: the photo, the picture and the visitor, all ours.
    const gen = (await admin().from("store_generations").select("status, chosen_index, images, names").single()).data!;
    expect(gen.status).toBe("done");
    expect(gen.chosen_index).toBe(1);
    expect((gen.images as { storage_path: string }[]).every((i) => i.storage_path.includes("/pictures/"))).toBe(true);

    // On return, the same picture (the chosen one) is back without making a new one.
    await page.reload();
    await expect(page.getByTestId("store-ready")).toContainText("Teddy is ready");
    await expect(page.getByLabel("Their name (optional, shown on the picture)")).toHaveValue("Teddy");
    await expect(page.locator(":is([data-testid=store-results],[data-testid=store-results-desktop]):visible").getByRole("radio", { name: "Picture 2" })).toHaveAttribute("aria-checked", "true");

    // A product under "On more gifts" opens with the same picture already on it.
    const title = await cards.first().getByTestId("store-card-title").textContent();
    await cards.first().click();
    await expect(page).toHaveURL(/from=related&g=/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title!);
    await expect(page.getByTestId("store-ready")).toBeVisible();
    expect((await admin().from("store_generations").select("id")).data).toHaveLength(1);
  });

  test("a photo added before is offered again on the next product", async ({ page }) => {
    await page.goto(`/store/product/${PILLOW}`);
    await createPicture(page, "Bo");
    await expect(page.getByTestId("store-ready")).toBeVisible({ timeout: 20_000 });
    await page.goto(`/store/product/${MUG}`);
    const earlier = page.getByTestId("earlier-photos");
    await expect(earlier).toBeVisible();
    await earlier.getByRole("button", { name: "Earlier photo 1" }).click();
    await expect(page.getByTestId("photo-added")).toBeVisible();
    await expect(page.getByTestId("store-create")).toBeEnabled();
  });

  test("failed: the message, and Choose another photo opens the same sheet as Change photo", async ({ page }) => {
    await page.goto(`/store/product/${PILLOW}`);
    await createPicture(page, "Oops");
    const failed = page.getByTestId("store-failed");
    await expect(failed).toContainText("We couldn't make this one", { timeout: 15_000 });
    await failed.getByRole("button", { name: "Choose another photo" }).click();
    await uploadInSheet(page);
    // The photo stays where it was added, and the name with it.
    await expect(page.getByTestId("photo-added")).toBeVisible();
    await expect(page.getByLabel("Their name (optional, shown on the picture)")).toHaveValue("Oops");
    await expect(page.getByTestId("store-create")).toBeEnabled();
  });

  test("their photo stays in one place: Change photo, a photo added before, Keep Teddy's picture, and the name", async ({ page }) => {
    await page.goto(`/store/product/${PILLOW}`);
    await createPicture(page, "Teddy");
    const ready = page.getByTestId("store-ready");
    await expect(ready).toContainText("Teddy is ready", { timeout: 20_000 });
    // No second "Try another photo" anywhere: the photo row is the one way to change it.
    await expect(page.getByRole("button", { name: "Try another photo" })).toHaveCount(0);

    // The sheet: upload, or a photo added before; the one in use is marked. Escape changes nothing.
    await ready.getByRole("button", { name: "Change photo" }).click();
    const sheet = page.getByTestId("store-photo-sheet");
    await expect(sheet.getByRole("heading", { name: "Choose another photo" })).toBeVisible();
    await expect(sheet.getByText("In use")).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(ready).toBeVisible();

    // A new photo: the picture stays on show, Create comes back, and Keep Teddy's picture undoes it.
    await ready.getByRole("button", { name: "Change photo" }).click();
    await uploadInSheet(page);
    await expect(page.getByTestId("photo-added")).toContainText("New photo added");
    await expect(page.getByTestId("store-stage").locator("canvas[data-preview]")).toBeVisible();
    await expect(page.getByTestId("store-create")).toBeEnabled();
    await page.getByRole("button", { name: "Keep Teddy's picture" }).click();
    await expect(ready).toContainText("Teddy is ready");
    await expect(page.getByTestId("store-add")).toBeVisible();

    // The photo just used is offered in the sheet next time, marked as in use; a changed name works the same way.
    await page.getByLabel("Their name (optional, shown on the picture)").fill("Ted");
    await expect(page.getByTestId("store-create")).toBeEnabled();
    await page.getByRole("button", { name: "Keep Teddy's picture" }).click();
    await expect(page.getByLabel("Their name (optional, shown on the picture)")).toHaveValue("Teddy");
    expect((await admin().from("store_generations").select("id")).data!.length).toBeGreaterThanOrEqual(1);
  });

  test("slow: Still painting after open_store.slow_after_s, then ready", async ({ page }) => {
    test.slow();
    await setSetting("open_store.slow_after_s", 10);
    await page.goto(`/store/product/${PILLOW}`);
    await createPicture(page, "Slowpoke");
    await expect(page.getByText("Still painting. This one's taking a little longer.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("store-ready")).toBeVisible({ timeout: 30_000 });
    await setSetting("open_store.slow_after_s", 90);
  });

  test("timed out after open_store.timeout_s: the failed message", async ({ page }) => {
    test.slow();
    await setSetting("open_store.timeout_s", 30);
    await page.goto(`/store/product/${PILLOW}`);
    await createPicture(page, "Forever");
    await expect(page.getByTestId("store-failed")).toBeVisible({ timeout: 50_000 });
    const gen = (await admin().from("store_generations").select("status").eq("status", "timed_out")).data;
    expect(gen).toHaveLength(1);
    await setSetting("open_store.timeout_s", 240);
  });

  test("limits: per visitor per day, then per IP; a failure doesn't count", async ({ browser }) => {
    await setSetting("open_store.generations_per_visitor_per_day", 1);
    const page = await browser.newPage();
    await page.goto(`/store/product/${PILLOW}`);
    await createPicture(page, "Oops");
    await expect(page.getByTestId("store-failed")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("store-failed").getByRole("button", { name: "Choose another photo" }).click();
    await uploadInSheet(page);
    await page.getByLabel("Their name (optional, shown on the picture)").fill("Max");
    await page.getByTestId("store-create").click();
    await expect(page.getByTestId("store-ready")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("store-ready").getByRole("button", { name: "Change photo" }).click();
    await uploadInSheet(page);
    await page.getByTestId("store-create").click();
    await expect(page.getByTestId("store-limited")).toContainText("You've made 1 picture today");
    await page.close();

    // A fresh visitor from an IP that has made its share.
    await setSetting("open_store.generations_per_visitor_per_day", 5);
    const made = (await admin().from("store_generations").select("id", { count: "exact", head: true }).not("status", "in", "(failed,timed_out)")).count!;
    await setSetting("open_store.generations_per_ip_per_day", made);
    const other = await browser.newPage();
    await other.goto(`/store/product/${PILLOW}`);
    await createPicture(other, "Max");
    await expect(other.getByTestId("store-limited")).toContainText("Lots of pictures have been made from here today");
    await other.close();
    await setSetting("open_store.generations_per_ip_per_day", 100000);
  });

  test("a two-photo theme sends both photos and returns three results", async ({ page }) => {
    await page.goto(`/store/product/${ACRYLIC}`);
    await addPhoto(page, "First pet's photo");
    await expect(page.getByTestId("store-create")).toBeDisabled();
    await addPhoto(page, "Second pet's photo");
    await page.getByTestId("store-create").click();
    await expect(page.getByTestId("store-ready")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(":is([data-testid=store-results],[data-testid=store-results-desktop]):visible").getByRole("radio")).toHaveCount(3);
    const gen = (await admin().from("store_generations").select("photo_ids, theme").eq("theme", "duo-portrait-01").single()).data!;
    expect(gen.photo_ids).toHaveLength(2);
  });

  test("another visitor gets 404 on every photo, picture and status; a signed-out stranger can't pick a result", async ({ page, browser }) => {
    await page.goto(`/store/product/${PILLOW}`);
    await createPicture(page, "Pip");
    await expect(page.getByTestId("store-ready")).toBeVisible({ timeout: 20_000 });
    const mine = await page.evaluate(() => [...document.querySelectorAll("img[src^='/api/store/files/']")].map((i) => i.getAttribute("src")!));
    const gen = (await admin().from("store_generations").select("id, photo_ids, images").order("created_at", { ascending: false }).limit(1).single()).data!;
    const files = [...new Set([...mine, `/api/store/files/p_${gen.photo_ids[0]}`, ...(gen.images as unknown[]).map((_, n) => `/api/store/files/g_${gen.id}_${n}`)])];
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const f of files) expect((await page.request.get(f)).status(), f).toBe(200);

    const stranger = await browser.newContext();
    const s = await stranger.newPage();
    await s.goto(`/store/product/${PILLOW}`); // a visitor cookie of its own
    for (const f of files) expect((await s.request.get(f)).status(), f).toBe(404);
    expect((await s.request.get(`/api/store/generations/${gen.id}`)).status()).toBe(404);
    expect((await s.request.patch(`/api/store/generations/${gen.id}`, { data: { chosen: 1 } })).status()).toBe(404);
    // Carrying someone else's picture over by its id shows nothing of theirs.
    await s.goto(`/store/product/${MUG}?g=${gen.id}`);
    await expect(s.getByTestId("store-ready")).toHaveCount(0);
    await stranger.close();
  });
});
