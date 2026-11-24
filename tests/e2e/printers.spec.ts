import { expect, test } from "@playwright/test";
import { admin, signInWithLink } from "./auth";
import { expectNoAxeViolations } from "./helpers";

// Settings › Printers (docs/dreamship.md › Part C), against the Dreamship fixtures: the account reports
// auto-submit of imported orders on, so the note shows. The app never changes Dreamship's settings.
test.describe.configure({ mode: "serial" });

test.describe("Settings › Printers", () => {
  test.beforeAll(async ({ request }) => {
    await request.post("/api/test/reset-fixtures");
  });
  test.afterAll(async () => {
    await admin().from("settings").update({ value: 6 }).eq("key", "dreamship.import_wait_hours");
  });

  test("others get 404; a customer too", async ({ page }) => {
    expect((await page.request.get("/settings/printers")).status()).toBe(404);
    await signInWithLink(page, "sam@example.com", "/");
    expect((await page.request.get("/settings/printers")).status()).toBe(404);
  });

  test("a super user sees all four printers, Dreamship's own settings, the auto-submit note, and checks the connection", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/settings/printers");
    await expect(page.getByRole("heading", { level: 1, name: "Printers" })).toBeVisible();
    for (const name of ["Dreamship", "Prodigi", "Gelato", "In house"]) await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    const settings = page.getByTestId("dreamship-order-settings");
    await expect(settings).toContainText("Auto-submit imported orders");
    await expect(settings).toContainText("On");
    await expect(page.getByTestId("auto-submit-note")).toHaveText("Dreamship sends imported orders to print straight away, so the customer's picture may not be on them in time.");
    await expect(page.getByTestId("printer-prodigi")).toContainText("Orders go to the existing print system straight from Shopify.");
    await expectNoAxeViolations(page);

    await page.getByTestId("check-dreamship").click();
    await expect(page.getByRole("status").filter({ hasText: "Connected: Storyboards Inc" })).toBeVisible();
    await expect(page.getByTestId("printer-dreamship")).toContainText(/Last checked.*OK/);
  });

  test("a printer setting saves", async ({ page }) => {
    await signInWithLink(page, "super@example.com", "/settings/printers");
    const field = page.getByLabel("Wait for Dreamship to import a paid order (hours)");
    await field.fill("8");
    await field.press("Enter");
    await expect.poll(async () => (await admin().from("settings").select("value").eq("key", "dreamship.import_wait_hours").single()).data?.value).toBe(8);
    await page.reload();
    await expect(page.getByLabel("Wait for Dreamship to import a paid order (hours)")).toHaveValue("8");
    const ev = (await admin().from("activity_log").select("props").eq("event", "admin_printer_settings_updated").order("occurred_at", { ascending: false }).limit(1).single()).data!;
    expect(ev.props).toMatchObject({ maker: "dreamship", keys: ["dreamship.import_wait_hours"] });
  });
});
