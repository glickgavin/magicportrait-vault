import { after, NextResponse } from "next/server";
import { clientIp, hashKey, rateLimit } from "@/lib/auth/http";
import { getSessionUser, safeNext } from "@/lib/auth/session";
import { ENTRY_COOKIE, ENTRY_COOKIE_SECONDS } from "@/lib/auth/entry";
import { getSettings } from "@/lib/settings";
import { checkEntryLink } from "@/lib/auth/entry-link";
import { establishSession } from "@/lib/auth/exchange";
import { markSignedIn } from "@/lib/db/members";
import { db } from "@/lib/db/client";
import { getSources } from "@/lib/sources";
import { syncKlaviyoProfile } from "@/lib/vault/klaviyo-profile";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

/**
 * Tracked entry link, e.g. the invoice email's https://my.magicportraits.ai/from/invoice.
 * Counts the click (names come from `tracking.entry_links`), remembers it for an hour so a sign-in can
 * be credited to it, then goes to `?to=` (a path on this site) or home.
 * With a valid signature (`?o=<order>&t=<time>&s=<sig>`, see lib/auth/entry-link.ts) it signs the
 * order's customer straight in for `tracking.entry_link_valid_hours` (24). Expired or wrong links
 * fall back to the normal sign-in. Super users are never signed in this way.
 */
export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const name = (await ctx.params).name.toLowerCase();
  const url = new URL(req.url);
  const to = safeNext(url.searchParams.get("to"), "/");
  // Always redirect to a clean address: the signature never stays in the address bar or history.
  const go = (path: string) => {
    const r = NextResponse.redirect(new URL(path, url.origin), 302);
    r.headers.set("cache-control", "no-store");
    r.headers.set("referrer-policy", "no-referrer");
    return r;
  };
  const s = await getSettings(["tracking.entry_links", "tracking.entry_link_valid_hours", "auth.link_ip_rate_limit_per_hour"] as const);
  if (!s["tracking.entry_links"].includes(name)) return go(to);
  const ip = hashKey(await clientIp(req));
  const user = await getSessionUser();

  // Signed link (e.g. the invoice email): sign the order's customer straight in, for 24 hours.
  const check = checkEntryLink(url.searchParams, s["tracking.entry_link_valid_hours"]);
  let signedIn: string | null = null;
  let note: string | null = check.ok ? null : check.reason;
  if (check.ok && (await rateLimit(`entry-signin:${ip}`, s["auth.link_ip_rate_limit_per_hour"]))) {
    const email = await orderEmail(check.order);
    if (!email) note = "order_not_found";
    else if (await isSuperUser(email)) note = "super_user"; // staff always sign in with a code
    else if (user?.email === email) signedIn = email;
    else if (await establishSession(email)) {
      signedIn = email;
      await markSignedIn(email);
      await track("vault_signed_in", { method: "entry_link", entry: name }, { email });
      after(() => syncKlaviyoProfile(email));
    } else note = "session_failed";
  }

  // Count the click (scanners and repeat taps from one address count once per hour, up to 5).
  if (await rateLimit(`entry:${name}:${ip}`, 5, 3600)) {
    await track("vault_entry_link_opened", { entry: name, signed: Boolean(signedIn), ...(note && note !== "missing" ? { link_check: note } : {}) }, { email: signedIn ?? user?.email ?? null, actor: "customer" });
  }
  const res = go(signedIn || user ? to : note === "expired" ? `/signin?next=${encodeURIComponent(to)}&expired=1` : to);
  res.cookies.set(ENTRY_COOKIE, name, { maxAge: ENTRY_COOKIE_SECONDS, httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/" });
  return res;
}

/** The order's email, read live from Shopify by order id (or order number as a fallback). */
async function orderEmail(order: string): Promise<string | null> {
  const { shopify } = await getSources();
  let o = await shopify.orderById(order).catch(() => null);
  if (!o && order.length <= 9) {
    const r = await shopify.resolveOrderByName(`#${order}`).catch(() => null);
    if (r) o = await shopify.orderById(r.id).catch(() => null);
  }
  if (!o || o.test || o.cancelledAt) return null;
  return (o.email ?? o.customer?.email ?? "").trim().toLowerCase() || null;
}

async function isSuperUser(email: string): Promise<boolean> {
  return (await db().rpc("is_super_user", { p_email: email })).data === true;
}
