import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { signInWithLink } from "./auth";
import { setSetting } from "./db";

// The shop's picture APIs: hidden until a switch is on, owner-only, uploads checked by content.
test.describe.configure({ mode: "serial" });

test.describe("shop pictures", () => {
  test.afterAll(async () => {
    await setSetting("shop.enabled", false);
    await setSetting("shop.super_user_preview", false);
  });

  test("with both switches off the shop APIs are 404 for everyone", async ({ page, request }) => {
    await setSetting("shop.enabled", false);
    await setSetting("shop.super_user_preview", false);
    expect((await request.get("/api/shop/pictures")).status()).toBe(404);
    await signInWithLink(page, "super@example.com", "/");
    expect((await page.request.get("/api/shop/pictures")).status()).toBe(404);
    expect((await page.request.post("/api/shop/uploads", { multipart: { file: { name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") } } })).status()).toBe(404);
  });

  test("the super-user preview shows it to super users only", async ({ page, browser }) => {
    await setSetting("shop.super_user_preview", true);
    await signInWithLink(page, "super@example.com", "/");
    const r = await page.request.get("/api/shop/pictures");
    expect(r.status()).toBe(200);
    const body = (await r.json()) as { portraits: unknown[]; photos: unknown[] };
    expect(Array.isArray(body.portraits) && Array.isArray(body.photos)).toBe(true);
    const other = await browser.newPage();
    await signInWithLink(other, "sam@example.com", "/");
    expect((await other.request.get("/api/shop/pictures")).status()).toBe(404);
    await other.close();
  });

  test("an upload is checked by content and appears under My photos", async ({ page }) => {
    await setSetting("shop.enabled", true);
    await signInWithLink(page, "sam@example.com", "/");
    const notAPicture = await page.request.post("/api/shop/uploads", { multipart: { file: { name: "dog.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not really a jpeg") } } });
    expect(notAPicture.status()).toBe(422);
    expect(((await notAPicture.json()) as { error: string }).error).toBe("not_an_image");
    const small = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#88aa66" } }).jpeg().toBuffer();
    expect(((await (await page.request.post("/api/shop/uploads", { multipart: { file: { name: "s.jpg", mimeType: "image/jpeg", buffer: small } } })).json()) as { error: string }).error).toBe("too_small");
    const good = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#88aa66" } }).png().toBuffer();
    const ok = await page.request.post("/api/shop/uploads", { multipart: { file: { name: "garden.png", mimeType: "image/png", buffer: good } } });
    expect(ok.status()).toBe(200);
    const { picture } = (await ok.json()) as { picture: { id: string; kind: string; width: number } };
    expect(picture.kind).toBe("new_upload");
    expect(picture.width).toBe(1600);
    const list = (await (await page.request.get("/api/shop/pictures")).json()) as { photos: { id: string; url: string }[] };
    const mine = list.photos.find((p) => p.id === picture.id);
    expect(mine?.url).toContain("token="); // a short-lived signed link, never a public one
  });
});
