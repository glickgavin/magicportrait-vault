import { expect, test } from "@playwright/test";
import { signInWithLink } from "./auth";
import { deleteCardsOf, insertCard, setSetting } from "./db";
import { expectNoAxeViolations } from "./helpers";

test.describe("home and my portraits", () => {
  test.afterAll(async () => {
    await deleteCardsOf("rose@example.com");
    await setSetting("cards.enabled", true);
  });

  test("a customer with no cards gets FirstHome", async ({ page }) => {
    await deleteCardsOf("sam@example.com");
    await signInWithLink(page, "sam@example.com", "/");
    await expect(page.getByTestId("home-first")).toBeVisible();
    await expect(page.getByText("Hi Sam")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Send a greeting card with your portrait" })).toBeVisible();
    await expect(page.getByTestId("make-my-card")).toHaveAttribute("href", "/create?entry=home");
    await expect(page.getByTestId("orders-row")).toContainText("Choose your free mug photo");
    // nothing else: no tabs, no recent cards, no "more gifts"
    await expect(page.getByRole("navigation", { name: "My Magic Portraits sections" })).toHaveCount(0);
    await expect(page.getByText("More digital gifts coming")).toHaveCount(0);
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("a customer with cards gets VaultHome", async ({ page }) => {
    await deleteCardsOf("rose@example.com");
    await insertCard("rose@example.com", { to_name: "Grandma Rose", status: "emailed", delivery: "email" });
    await signInWithLink(page, "rose@example.com", "/");
    await expect(page.getByTestId("home-vault")).toBeVisible();
    await expect(page.getByRole("heading", { name: "My Magic Portraits" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "My Magic Portraits sections" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Greeting cards" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent cards" })).toBeVisible();
    await expect(page.getByText("Grandma Rose")).toBeVisible();
    await expect(page.getByText("Emailed")).toBeVisible();
    await expect(page.getByText("More digital gifts coming")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("a creator gets VaultGuest with locked cards", async ({ page }) => {
    await signInWithLink(page, "charlie@example.com", "/");
    await expect(page.getByTestId("home-guest")).toBeVisible();
    await expect(page.getByText("Welcome back")).toBeVisible();
    await expect(page.getByTestId("cards-locked")).toContainText("Unlock greeting cards");
    await expect(page.getByRole("link", { name: "Order as wall art" })).toHaveAttribute("href", /order\?product_id=8471707222212&magicid=999&session=/);
    await expectNoAxeViolations(page);
  });

  test("nobody found gets the kind empty state", async ({ page }) => {
    await signInWithLink(page, "nobody@example.com", "/");
    await expect(page.getByTestId("home-empty")).toBeVisible();
    await expect(page.getByRole("heading", { name: "We couldn't find portraits on this email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try another email" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create a portrait" })).toHaveAttribute("href", "https://magicportraits.ai/start");
    await expectNoAxeViolations(page);
  });

  test("cards.enabled off hides the card entry points", async ({ page }) => {
    await setSetting("cards.enabled", false);
    await deleteCardsOf("sam@example.com");
    await signInWithLink(page, "sam@example.com", "/");
    await expect(page.getByTestId("make-my-card")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Create a card/ })).toHaveCount(0);
    await page.getByTestId("menu-button").click();
    await expect(page.getByRole("dialog").getByRole("link", { name: /Create a card/ })).toHaveCount(0);
    await setSetting("cards.enabled", true);
  });

  test("My portraits: groups, ORDERED badges, filters and deep links", async ({ page }) => {
    await signInWithLink(page, "sam@example.com", "/portraits");
    await expect(page.getByRole("heading", { name: "My portraits" })).toBeVisible();
    await expect(page.getByText("3 sessions · 12 portraits · 3 ordered")).toBeVisible();
    await expect(page.getByTestId("session-card")).toHaveCount(3);
    await expect(page.getByText("ORDERED", { exact: true })).toHaveCount(3);
    const royal = page.getByRole("region", { name: "Royal Robes" });
    await expect(royal.getByText("Order #1001")).toBeVisible();
    await expect(royal.getByRole("link", { name: "Order more" })).toHaveAttribute("href", /session=1a000000-0000-4000-8000-000000000001$/);
    await expect(royal.getByRole("link", { name: "Make a card" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Space Explorer" }).getByRole("link", { name: "Order as wall art" })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole("radio", { name: "Ordered", exact: true }).click();
    await expect(page).toHaveURL(/filter=ordered/);
    await expect(page.getByTestId("session-card")).toHaveCount(2);
    await expect(page.getByRole("radio", { name: "Ordered", exact: true })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("radio", { name: "Not ordered" }).click();
    await expect(page).toHaveURL(/filter=not_ordered/);
    await expect(page.getByText("ORDERED", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Create a new portrait" })).toHaveAttribute("href", "https://magicportraits.ai/start");
  });

  test("a creator's portraits have no Make a card", async ({ page }) => {
    await signInWithLink(page, "charlie@example.com", "/portraits");
    await expect(page.getByTestId("session-card")).toHaveCount(2);
    await expect(page.getByRole("link", { name: "Make a card" })).toHaveCount(0);
  });
});
