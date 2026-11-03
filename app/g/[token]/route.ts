import { NextResponse } from "next/server";
import { consumeSigninLink } from "@/lib/auth/links";
import { establishSession } from "@/lib/auth/exchange";
import { clientIp, hashKey, rateLimit } from "@/lib/auth/http";
import { markSignedIn } from "@/lib/db/members";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

const ENTRY: Record<string, string> = { gift_offer: "order_email", mug_reminder: "order_email", gift_reminder: "reminder_email", admin_resend: "order_email" };

/**
 * One-tap link. Signs the person in on the server, then redirects to a clean address:
 * the token never stays in the address bar, history or analytics.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const base = env.appUrl;
  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, base), 303);
    res.headers.set("cache-control", "no-store");
    res.headers.set("referrer-policy", "no-referrer");
    return res;
  };
  if (!(await rateLimit(`glink-ip:${hashKey(await clientIp())}`, 60))) return go("/signin");

  const result = await consumeSigninLink(token);
  if (result.status === "unknown") return go("/signin");
  if (result.status === "expired") {
    await track("vault_signin_link_used", { order_id: result.link.order_legacy_id, expired: true }, { email: result.link.email });
    return go("/signin?expired=1");
  }
  const { link, firstUse } = result;
  const ok = await establishSession(link.email);
  if (!ok) return go("/signin");

  await markSignedIn(link.email);
  await track("vault_signin_link_used", { order_id: link.order_legacy_id, expired: false }, { email: link.email });
  await track("vault_signed_in", { method: "link" }, { email: link.email });
  if (link.gift_offer_id && firstUse) {
    const now = new Date().toISOString();
    await db().from("gift_offers").update({ first_used_at: now, email_opened_at: now }).eq("id", link.gift_offer_id).is("first_used_at", null);
    await track("gift_offer_email_opened", { order_id: link.order_legacy_id }, { email: link.email, ref: link.order_legacy_id ? { type: "order", id: link.order_legacy_id } : null });
  }
  const path = link.redirect_path.startsWith("/create") ? `/create?entry=${ENTRY[link.purpose] ?? "order_email"}` : link.redirect_path;
  return go(path);
}
