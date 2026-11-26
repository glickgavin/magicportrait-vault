import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { signInWithLink } from "./auth";

// Settings › Shop › Preview template: an uploaded photo can be removed with its ×.
test("an uploaded template photo can be removed with its ×", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one viewport is enough");
  await signInWithLink(page, "super@example.com", "/");
  await page.goto("/settings/shop?group=all");
  const tile = page.getByTestId("shop-product").filter({ hasText: "Magic Portrait Tile" });
  const product = await tile.getByRole("link", { name: "Open Magic Portrait Tile →" }).getAttribute("href");
  await page.goto(product!);
  const href = await page.getByRole("link", { name: "Open template editor →" }).getAttribute("href");
  await page.goto(href!);
  const photo = async (colour: string) => ({ name: `${colour.slice(1)}.png`, mimeType: "image/png", buffer: await sharp({ create: { width: 600, height: 600, channels: 3, background: colour } }).png().toBuffer() });
  const input = page.getByLabel("Upload a photo of the blank product").first();
  const x = page.getByRole("button", { name: "Remove this uploaded photo" });
  await expect(page.getByRole("button", { name: "Publish to Shopify" })).toBeVisible();
  const start = await x.count();
  await input.setInputFiles(await photo("#ff0000"));
  await expect(x).toHaveCount(start + 1); // only in its own list, and even while the draft uses it
  await input.setInputFiles(await photo("#00ff00"));
  await expect(x).toHaveCount(start + 2);
  // The one in use: the draft moves to another photo, then it goes.
  await x.first().click();
  await expect(x).toHaveCount(start + 1);
  await x.first().click();
  await expect(x).toHaveCount(start);
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove this uploaded photo" })).toHaveCount(start);
});

test("a photo the live template uses is removed at once and deleted when you publish", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one viewport is enough");
  await signInWithLink(page, "super@example.com", "/");
  await page.goto("/settings/shop?group=all");
  const tile = page.getByTestId("shop-product").filter({ hasText: "Magic Portrait Tile" });
  const product = await tile.getByRole("link", { name: "Open Magic Portrait Tile →" }).getAttribute("href");
  await page.goto(product!);
  const href = await page.getByRole("link", { name: "Open template editor →" }).getAttribute("href");
  await page.goto(href!);
  const x = page.getByRole("button", { name: "Remove this uploaded photo" });
  await expect(page.getByRole("button", { name: "Publish to Shopify" })).toBeVisible();
  const start = await x.count();
  const png = await sharp({ create: { width: 600, height: 600, channels: 3, background: "#3366ff" } }).png().toBuffer();
  await page.getByLabel("Upload a photo of the blank product").first().setInputFiles({ name: "blue.png", mimeType: "image/png", buffer: png });
  await expect(x).toHaveCount(start + 1);
  // Publish with the new photo, so the live template uses it.
  await page.getByRole("button", { name: "Publish to Shopify" }).click();
  await expect(page.getByText("Published to Shopify.")).toBeVisible();
  await page.reload();
  const deletes: string[] = [];
  page.on("request", (r) => r.method() === "DELETE" && r.url().includes("/template/upload") && deletes.push(r.url()));
  await page.getByRole("button", { name: "Remove this uploaded photo" }).first().click();
  await expect(page.getByText("Removed. The live template still uses it, so it's deleted when you publish.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove this uploaded photo" })).toHaveCount(start);
  expect(deletes).toHaveLength(0);
  await page.getByRole("button", { name: "Publish to Shopify" }).click();
  await expect(page.getByText("Published to Shopify.")).toBeVisible();
  await expect.poll(() => deletes.length).toBe(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove this uploaded photo" })).toHaveCount(start);
});
