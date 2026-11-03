import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { admin, signInWithLink } from "./auth";
import { deleteCardsOf } from "./db";
import { expectNoAxeViolations } from "./helpers";

const OUTBOX = path.join(process.cwd(), ".tmp/sent-emails");
function mailsTo(to: string) {
  let files: string[] = [];
  try {
    files = readdirSync(OUTBOX).sort();
  } catch {
    return [];
  }
  return files.map((f) => JSON.parse(readFileSync(path.join(OUTBOX, f), "utf8")) as { to: string; subject: string; html: string }).filter((m) => m.to === to);
}

async function makeEmailedCard(page: import("@playwright/test").Page, recipient: string, schedule = false) {
  await page.goto("/create?step=theme");
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  for (const step of ["step-theme", "step-portrait"]) {
    await expect(page.getByTestId(step)).toBeVisible();
    const radio = page.getByTestId(step).getByRole("radio").first();
    await expect(async () => {
      await radio.click();
      await expect(radio).toHaveAttribute("aria-checked", "true", { timeout: 1000 });
    }).toPass({ timeout: 20_000 });
    await page.getByTestId("next").click();
  }
  await page.getByLabel("To", { exact: true }).fill("Grandma Rose");
  await page.getByRole("radio", { name: /Email it for me/ }).check();
  await page.getByLabel("Their email").fill(recipient);
  if (schedule) {
    await page.getByRole("radio", { name: "Pick a date" }).check();
    const at = new Date(Date.now() + 5 * 86_400_000);
    await page.getByLabel("Date and time").fill(new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  }
  await page.getByTestId("create-card").click();
  await page.waitForURL(/\/cards\/C-/, { timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });

test.describe("email delivery and My cards", () => {
  test.beforeAll(async () => {
    await deleteCardsOf("rose@example.com");
  });

  test("email now: sent at once, the email link marks it opened, then a clean URL", async ({ page, browser }) => {
    const recipient = `gr${Date.now()}@example.com`;
    await signInWithLink(page, "rose@example.com", "/");
    await makeEmailedCard(page, recipient);
    await expect(page.getByTestId("delivery-status")).toContainText("Emailed to Grandma Rose");
    const [mail] = mailsTo(recipient);
    expect(mail.subject).toMatch(/Rose sent you a .* card/);
    const link = mail.html.match(/href="([^"]*\/c\/[^"?]+\?d=[0-9a-f-]{36})"/)![1].replace(/&amp;/g, "&");
    const recipientPage = await (await browser.newContext()).newPage();
    await recipientPage.goto(new URL(new URL(link).pathname + new URL(link).search, page.url()).toString());
    await expect(recipientPage).toHaveURL(/\/c\/[A-Za-z0-9_-]+$/);
    await expect(recipientPage.getByTestId("public-card")).toBeVisible();
    await page.goto("/cards");
    await expect(page.getByTestId("my-card").first()).toContainText("Opened");
    // "Don't email me cards"
    const unsub = mail.html.match(/href="([^"]*\/unsubscribe\?d=[^"]+)"/)![1].replace(/&amp;/g, "&");
    await recipientPage.goto(new URL(new URL(unsub).pathname + new URL(unsub).search, page.url()).toString());
    await expectNoAxeViolations(recipientPage);
    await recipientPage.getByRole("button", { name: "Stop card emails" }).click();
    await expect(recipientPage.getByRole("heading", { name: /No more card emails/ })).toBeVisible();
    const sup = await admin().from("email_suppressions").select("scope").eq("email", recipient);
    expect(sup.data).toEqual([{ scope: "card_emails" }]);
  });

  test("My cards: list, resend, use again", async ({ page }) => {
    const recipient = `rs${Date.now()}@example.com`;
    await signInWithLink(page, "rose@example.com", "/");
    await makeEmailedCard(page, recipient);
    await page.goto("/cards");
    await expect(page.getByRole("heading", { name: "My cards" })).toBeVisible();
    await expectNoAxeViolations(page);
    const first = page.getByTestId("my-card").first();
    await expect(first).toContainText("Emailed");
    await first.getByRole("button", { name: "Resend email" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sent again." })).toBeVisible();
    expect(mailsTo(recipient)).toHaveLength(2);
    await first.getByRole("button", { name: "Use again" }).click();
    await expect(page.getByTestId("step-message")).toBeVisible();
    await expect(page.getByLabel("To", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Message", { exact: true })).not.toHaveValue("");
  });

  test("scheduled cards: change the time and message, then cancel", async ({ page }) => {
    const recipient = `sc${Date.now()}@example.com`;
    await signInWithLink(page, "rose@example.com", "/");
    await makeEmailedCard(page, recipient, true);
    await page.goto("/cards");
    const card = page.getByTestId("my-card").filter({ hasText: "Scheduled" }).first();
    await card.getByRole("button", { name: /More for the card/ }).click();
    await page.getByRole("menuitem", { name: "Change" }).click();
    await expect(page.getByTestId("step-message")).toBeVisible();
    await page.getByLabel("Message", { exact: true }).fill("Changed message");
    await page.getByRole("button", { name: /Save changes/ }).click();
    await page.waitForURL(/\/cards\/C-/, { timeout: 30_000 });
    await expect(page.getByTestId("delivery-status")).toContainText("Sends");
    const { data } = await admin().from("cards").select("id, message, status").eq("recipient_email", recipient).single();
    expect(data).toMatchObject({ message: "Changed message", status: "scheduled" });
    const changed = await admin().from("activity_log").select("props").eq("event", "card_schedule_changed").order("id", { ascending: false }).limit(1).single();
    expect(changed.data).toMatchObject({ props: { changed: "content" } });
    await page.goto("/cards");
    page.once("dialog", (d) => d.accept());
    await page.getByTestId("my-card").filter({ hasText: "Scheduled" }).first().getByRole("button", { name: /More for the card/ }).click();
    await page.getByRole("menuitem", { name: "Cancel sending" }).click();
    await expect(page.getByTestId("my-card").first()).toContainText("Cancelled");
    expect(mailsTo(recipient)).toHaveLength(0);
  });

  test("cron endpoints need the secret", async ({ request }) => {
    expect((await request.get("/api/cron/send-scheduled")).status()).toBe(401);
    expect((await request.get("/api/cron/flush-outbox", { headers: { authorization: "Bearer nope" } })).status()).toBe(401);
    expect((await request.get("/api/cron/send-scheduled", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })).status()).toBe(200);
  });

  test("the AgentMail webhook rejects unsigned calls", async ({ request }) => {
    const r = await request.post("/api/webhooks/agentmail", { data: { event_type: "message.bounced" } });
    expect(r.status()).toBe(401);
  });
});
