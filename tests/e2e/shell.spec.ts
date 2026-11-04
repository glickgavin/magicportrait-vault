import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./helpers";

test.describe("app shell", () => {
  for (const width of [360, 390, 1280]) {
    test(`header, menu and footer at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      // Header: hamburger, logo, sign-in spot at the right (no cart since the 4 Nov review)
      await expect(page.getByTestId("menu-button")).toBeVisible();
      const logo = page.locator("header img[alt='Magic Portraits AI']");
      await expect(logo).toBeVisible();
      const box = await logo.boundingBox();
      expect(Math.round(box!.height)).toBe(30);
      const signIn = page.locator("header").getByRole("link", { name: "Sign in" });
      await expect(signIn).toBeVisible();
      // The sign-in spot never overlaps the logo
      const s = await signIn.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(s!.x + 1);
      await expect(page.getByRole("link", { name: "Your order" })).toHaveCount(0);
      // Footer
      await expect(page.getByRole("contentinfo")).toContainText("Products:");
      await expect(page.getByRole("contentinfo")).toContainText("Privacy Policy");
      await expectNoAxeViolations(page);

      // Menu
      await page.getByTestId("menu-button").click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("My Magic Portraits");
      await expect(dialog.getByRole("link", { name: /Create a card/ })).toBeVisible();
      await expect(dialog).toContainText("Orders, downloads & mugs");
      await expect(dialog).toContainText("Pet Portraits");
      await expect(dialog).toContainText("Photo Books");
      await expectNoAxeViolations(page);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });
  }

  test("unknown pages show the 404 page with noindex", async ({ page }) => {
    const res = await page.goto("/this-does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
    expect(res?.headers()["x-robots-tag"]).toContain("noindex");
  });
});
