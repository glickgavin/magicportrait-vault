import { expect, test } from "@playwright/test";
import { makeLink, signInWithCode, signInWithLink } from "./auth";
import { expectNoAxeViolations } from "./helpers";
import { setSetting } from "./db";

test.describe("sign-in and account", () => {
  test("signs in with a 6-digit code, shows initials, opens the account menu, signs out", async ({ page }) => {
    await page.goto("/signin");
    await expectNoAxeViolations(page);
    await signInWithCode(page, "sam@example.com");
    await expect(page).toHaveURL(/\/$/);
    const avatar = page.getByTestId("avatar-button");
    await expect(avatar).toContainText("SL");
    await avatar.click();
    const menu = page.getByRole("menu");
    await expect(menu).toContainText("sam@example.com");
    await expect(menu).not.toContainText("Settings");
    await menu.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/signin/);
    await expect(page.locator("header").getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("a wrong code shows an error and keeps the person on the code step", async ({ page }) => {
    await page.goto("/signin");
    await page.getByLabel("Your email").fill("rose@example.com");
    await page.getByRole("button", { name: "Find my portraits" }).click();
    await page.getByLabel("6-digit code").fill("000000");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("#signin-error")).toContainText("That code didn't work");
  });

  test("a one-tap link signs in and the token never stays in the address bar", async ({ page }) => {
    const link = await makeLink("rose@example.com");
    const token = link.split("/").pop()!;
    const seen: string[] = [];
    page.on("framenavigated", (f) => f === page.mainFrame() && seen.push(f.url()));
    await page.goto(link);
    await page.waitForURL(/\/create/);
    expect(page.url()).not.toContain(token);
    expect(new URL(page.url()).pathname).toBe("/create");
    expect(seen.filter((u) => !u.includes("/g/")).every((u) => !u.includes(token))).toBe(true);
    await expect(page.getByTestId("avatar-button")).toContainText("RP");
  });

  test("an expired link falls back to sign-in with a note", async ({ page }) => {
    const link = await makeLink("rose@example.com", { days: -1 });
    await page.goto(link);
    await page.waitForURL(/\/signin\?expired=1/);
    await expect(page.locator("#signin-error")).toContainText("That link has expired");
  });

  test("an unknown link falls back to sign-in", async ({ page }) => {
    await page.goto("/g/" + "A".repeat(43));
    await page.waitForURL(/\/signin$/);
  });

  test("non-super users get 404 on /settings; super users don't", async ({ page }) => {
    const anon = await page.goto("/settings");
    expect(anon?.status()).toBe(404);
    await signInWithLink(page, "sam@example.com");
    expect((await page.goto("/settings"))?.status()).toBe(404);
    expect((await page.goto("/settings/insights"))?.status()).toBe(404);
    await page.context().clearCookies();
    await signInWithLink(page, "super@example.com");
    expect((await page.goto("/settings"))?.status()).toBe(200);
    await page.goto("/");
    await page.getByTestId("avatar-button").click();
    await expect(page.getByRole("menu")).toContainText("Super user");
  });

  test("old redeem links: sign in for the order, then open it", async ({ page }) => {
    await page.goto("/redeem/1001");
    await expect(page.getByRole("heading", { name: "Order #1001" })).toBeVisible();
    await expectNoAxeViolations(page);
    await signInWithCode(page, "sam@example.com", "/redeem?order=1001");
    await expect(page).toHaveURL(/\/orders\/1001$/);
    await expect(page.getByRole("heading", { name: "Order #1001" })).toBeVisible();
  });

  test("someone else's order and an unknown order show the same generic message", async ({ page }) => {
    await signInWithLink(page, "rose@example.com");
    await page.goto("/orders/1001");
    const a = await page.getByTestId("order-not-found").innerText();
    await page.goto("/orders/999999");
    const b = await page.getByTestId("order-not-found").innerText();
    expect(a).toBe(b);
    expect(a).toContain("We couldn't find that order on this email");
    expect(a).not.toContain("sam");
  });
});

test.describe("test sign-in (previews only)", () => {
  test.afterEach(async () => setSetting("auth.test_signin_enabled", false));

  test("hidden by default; when on, signs in as any email without a code", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByTestId("test-signin")).toHaveCount(0);
    await setSetting("auth.test_signin_enabled", true);
    await page.goto("/signin");
    await page.getByLabel(/email/i).first().fill("sam@example.com");
    await page.getByTestId("test-signin").click();
    await page.waitForURL((u) => !u.pathname.startsWith("/signin"));
    await expect(page.getByTestId("avatar-button")).toBeVisible();
  });
});
