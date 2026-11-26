import { expect, test } from "@playwright/test";
import { admin, signInWithLink } from "./auth";
import { expectNoAxeViolations } from "./helpers";

// The personalisation layer in the template editor (docs/shop.md › Personalisation layer), on the fixture Pillow:
// two text boxes and a picture slot with an SVG uploaded to the art library, published and read back.
test.describe.configure({ mode: "serial" });

const PILLOW = "8703000000";
const PAW = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><circle cx="50" cy="50" r="40" fill="#c33"/></svg>';

test.describe("Personalisation layer in the template editor", () => {
  test.beforeEach(async ({ request }) => {
    await request.post("/api/test/reset-fixtures?shop=1");
  });
  test.afterAll(async ({ request }) => {
    await request.post("/api/test/reset-fixtures?shop=1");
    await admin().from("layer_art").delete().like("name", "e2e-%");
  });

  test("set up two text boxes and a picture, publish, and read it back", async ({ page }) => {
    await signInWithLink(page, "super@example.com", `/settings/shop/template/${PILLOW}`);
    const editor = page.getByTestId("layer-editor");
    await expect(editor).toBeVisible();
    await editor.getByLabel("Let customers personalise this product").check();
    await expect(editor.getByTestId("layer-panel")).toBeVisible();

    await editor.getByLabel("What to ask the customer (Text 1)").fill("Pet's name");
    await editor.getByLabel("Example words (Text 1)").fill("Teddy");
    await editor.getByLabel("Font (Text 1)").selectOption("Lobster");
    await editor.getByLabel("The customer must fill this in (Text 1)").check();
    // At an angle: the box on the print area turns with it.
    await editor.getByLabel("Angle in degrees (Text 1)").fill("-15");
    await expect(editor.getByText("Angle (Text 1): -15°")).toBeVisible();
    await expect(editor.getByTestId("layer-panel").locator("div[style*='rotate(-15deg)']")).toHaveCount(1);
    await editor.getByRole("button", { name: "+ Add text 2" }).click();
    await editor.getByLabel("Most characters (Text 2)").fill("20");
    await editor.getByLabel("From the top % (Text 2)").fill("5");

    // A picture slot with nothing offered can't be published.
    await editor.getByRole("button", { name: "+ Add a picture slot" }).click();
    await expect(page.getByTestId("layer-problem")).toHaveText("Choose at least one picture for the picture slot, or remove the slot.");
    await expect(page.getByRole("button", { name: "Publish to Shopify" })).toBeDisabled();
    await editor.getByLabel("Upload a picture to the art library").setInputFiles({ name: `e2e-paw-${test.info().project.name}.svg`, mimeType: "image/svg+xml", buffer: Buffer.from(PAW) });
    await expect(editor.getByText("Pictures offered (1 of 3), from the art library")).toBeVisible();
    await expect(page.getByTestId("layer-problem")).toHaveCount(0);
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "Publish to Shopify" }).click();
    await expect(page.getByText("Published to Shopify.")).toBeVisible();

    await page.reload();
    await expect(editor.getByLabel("Let customers personalise this product")).toBeChecked();
    await expect(editor.getByLabel("What to ask the customer (Text 1)")).toHaveValue("Pet's name");
    await expect(editor.getByLabel("Font (Text 1)")).toHaveValue("Lobster");
    await expect(editor.getByLabel("Angle in degrees (Text 1)")).toHaveValue("-15");
    await expect(editor.getByLabel("From the top % (Text 2)")).toHaveValue("5");
    await expect(editor.getByText("Pictures offered (1 of 3), from the art library")).toBeVisible();
    const ev = (await admin().from("activity_log").select("props").eq("event", "admin_shop_template_published").order("occurred_at", { ascending: false }).limit(1)).data!;
    expect(ev[0].props).toMatchObject({ product_id: PILLOW, layer: true, layer_texts: 2, layer_art: 1 });
    if (test.info().project.name === "mobile") expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test("an unsafe SVG is refused", async ({ page }) => {
    await signInWithLink(page, "super@example.com", `/settings/shop/template/${PILLOW}`);
    const editor = page.getByTestId("layer-editor");
    await editor.getByLabel("Let customers personalise this product").check();
    await editor.getByRole("button", { name: "+ Add a picture slot" }).click();
    await editor.getByLabel("Upload a picture to the art library").setInputFiles({ name: "e2e-bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>') });
    await expect(editor.getByRole("alert")).toHaveText("That SVG has scripts, links or embedded parts that can't be used. Export it as a plain drawing.");
  });
});
