import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { signInWithLink } from "./auth";

// Settings › Shop › Preview template: an uploaded photo can be removed with its ×.
test("an uploaded template photo can be removed with its ×", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one viewport is enough");
  await signInWithLink(page, "super@example.com", "/");
  await page.goto("/settings/shop");
  const tile = page.getByTestId("shop-product").filter({ hasText: "Magic Portrait Tile" });
  const href = await tile.getByRole("link", { name: /preview template/i }).getAttribute("href");
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
