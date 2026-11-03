import { expect, test } from "@playwright/test";
import { signInWithLink } from "./auth";
import { expectNoAxeViolations } from "./helpers";

const FORBIDDEN = /debug|@example\.com|orderEmail|customerEmail|tokenPresent|stack|gid:\/\//i;

test.describe.configure({ mode: "serial" });

test.describe("orders, downloads and mugs", () => {
  test.beforeAll(async ({ request }) => {
    expect((await request.post("/api/test/reset-fixtures")).status()).toBe(200);
  });

  test("orders list: banner, chips, statuses", async ({ page }) => {
    await signInWithLink(page, "sam@example.com", "/orders");
    await expect(page.getByRole("heading", { name: "Orders, downloads & mugs" })).toBeVisible();
    await expect(page.getByTestId("mug-banner")).toContainText("Choose your free mug photo");
    const rows = page.getByTestId("order-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "Order #1001" })).toContainText("Free mug · choose photo");
    await expect(rows.filter({ hasText: "Order #1001" })).toContainText("2 downloads ready");
    await expect(rows.filter({ hasText: "Order #1002" })).toContainText("Mug printed");
    await expect(rows.filter({ hasText: "Order #1002" })).toContainText("Delivered");
    await expectNoAxeViolations(page);
  });

  test("choose and save the mug photo, then the saved state", async ({ page }) => {
    await signInWithLink(page, "sam@example.com", "/orders/1001");
    await expect(page.getByTestId("order-detail")).toBeVisible();
    await expectNoAxeViolations(page);
    const mug = page.getByTestId("mug-section");
    const save = page.getByTestId("save-mug");
    await expect(save).toBeDisabled();
    await mug.getByRole("radio", { name: "Portrait 2" }).click();
    await expect(mug.getByRole("radio", { name: "Portrait 2" })).toHaveAttribute("aria-checked", "true");
    await save.click();
    await expect(mug.getByRole("status")).toHaveText("Saved. This is the photo we'll print.");
    await expect(save).toBeDisabled(); // same as saved
    await page.reload();
    await expect(page.getByTestId("mug-section")).toContainText("Portrait 2 is on your mug");
    await expect(page.getByTestId("mug-section").getByRole("radio", { name: "Portrait 2" })).toHaveAttribute("aria-checked", "true");
  });

  test("locked (printing started): read-only with the locked text, and the API refuses", async ({ page }) => {
    await signInWithLink(page, "sam@example.com", "/orders/1002");
    await expect(page.getByTestId("mug-section")).toContainText("Your mug is being printed with this photo");
    await expect(page.getByTestId("save-mug")).toHaveCount(0);
    const r = await page.request.post("/api/orders/1002/mug", { data: { tileId: "x" } });
    expect(r.status()).toBe(409);
    expect(await r.text()).not.toMatch(FORBIDDEN);
    await expectNoAxeViolations(page);
  });

  test("downloads: list, single file, zip", async ({ page }) => {
    await signInWithLink(page, "sam@example.com", "/orders/1001");
    await expect(page.getByTestId("downloads")).toContainText("magic-portrait-royal-robes-1.jpg");
    const one = await page.request.get("/api/orders/1001/download/1");
    expect(one.status()).toBe(200);
    expect(one.headers()["content-disposition"]).toContain("magic-portrait-royal-robes-1.jpg");
    const zip = await page.request.get("/api/orders/1001/download-all");
    expect(zip.status()).toBe(200);
    expect(zip.headers()["content-type"]).toBe("application/zip");
  });

  test("another email's order is a 404 for view, mug save and download, with no detail", async ({ page }) => {
    await signInWithLink(page, "rose@example.com", "/");
    await page.goto("/orders/1001");
    await expect(page.getByTestId("order-not-found")).toBeVisible();
    await expect(page.locator("main")).not.toContainText("sam");
    for (const r of [
      await page.request.post("/api/orders/1001/mug", { data: { tileId: "5e550001-0001-4000-8000-000000000001" } }),
      await page.request.get("/api/orders/1001/download/1"),
      await page.request.get("/api/orders/1001/download-all"),
      await page.request.get("/api/orders/999999/download/1"),
    ]) {
      expect(r.status()).toBe(404);
      const text = await r.text();
      expect(JSON.parse(text)).toEqual({ error: "not_found" });
      expect(text).not.toMatch(FORBIDDEN);
    }
  });

  test("signed-out API calls are refused without detail", async ({ request }) => {
    for (const r of [await request.post("/api/orders/1001/mug", { data: { tileId: "x" } }), await request.get("/api/orders/1001/download/1")]) {
      expect(r.status()).toBe(401);
      expect(await r.json()).toEqual({ error: "unauthorized" });
    }
  });
});
