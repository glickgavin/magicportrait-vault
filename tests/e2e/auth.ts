import { createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

const mailpit = () => process.env.MAILPIT_URL || "http://127.0.0.1:54324";
export const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function clearMail(email: string) {
  await fetch(`${mailpit()}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`, { method: "DELETE" }).catch(() => undefined);
}

/** Reads the newest sign-in code sent to `email` from the local stack's mail catcher. */
export async function latestCode(email: string, timeoutMs = 15_000): Promise<string> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await fetch(`${mailpit()}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=1`);
    const body = (await r.json()) as { messages?: { ID: string }[] };
    const id = body.messages?.[0]?.ID;
    if (id) {
      const m = (await (await fetch(`${mailpit()}/api/v1/message/${id}`)).json()) as { Text?: string; HTML?: string };
      const code = (m.Text || m.HTML || "").match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`no code arrived for ${email}`);
}

/** The real flow: email → code from the mail catcher → signed in. */
export async function signInWithCode(page: Page, email: string, path = "/signin") {
  await clearMail(email);
  await page.goto(path);
  await page.getByLabel("Your email").fill(email);
  await page.getByRole("button", { name: /Find my portraits|Send my code/ }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  const code = await latestCode(email);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin") && !u.pathname.startsWith("/redeem"));
}

/** Makes a one-tap link directly in the local stack (same hashing as the app). */
export async function makeLink(email: string, opts: { days?: number; purpose?: string; redirect?: string } = {}) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHmac("sha256", process.env.GIFT_LINK_SECRET!).update(token).digest("hex");
  const { error } = await admin()
    .from("signin_links")
    .insert({ token_hash: hash, email, purpose: opts.purpose ?? "admin_resend", redirect_path: opts.redirect ?? "/create", expires_at: new Date(Date.now() + (opts.days ?? 30) * 86_400_000).toISOString() });
  if (error) throw error;
  return `/g/${token}`;
}

/** Fast sign-in for screens that don't test sign-in itself. */
export async function signInWithLink(page: Page, email: string, redirect = "/") {
  await page.goto(await makeLink(email, { redirect }));
  await page.waitForURL((u) => !u.pathname.startsWith("/g/"));
  await page.waitForLoadState("load");
}
