import { NextResponse } from "next/server";
import { clientIp, hashKey, rateLimit } from "@/lib/auth/http";
import { getSessionUser, safeNext } from "@/lib/auth/session";
import { ENTRY_COOKIE, ENTRY_COOKIE_SECONDS } from "@/lib/auth/entry";
import { getSetting } from "@/lib/settings";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

/**
 * Tracked entry link, e.g. the invoice email's https://my.magicportraits.ai/from/invoice.
 * Counts the click (names come from `tracking.entry_links`), remembers it for an hour so a sign-in can
 * be credited to it, then goes to `?to=` (a path on this site) or home, which asks to sign in if needed.
 */
export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const name = (await ctx.params).name.toLowerCase();
  const url = new URL(req.url);
  const to = safeNext(url.searchParams.get("to"), "/");
  const res = NextResponse.redirect(new URL(to, url.origin), 302);
  res.headers.set("cache-control", "no-store");
  const allowed = await getSetting("tracking.entry_links");
  if (!allowed.includes(name)) return res;
  // Link scanners and repeat taps from one address don't inflate the count.
  if (await rateLimit(`entry:${name}:${hashKey(await clientIp(req))}`, 5, 3600)) {
    const user = await getSessionUser();
    await track("vault_entry_link_opened", { entry: name }, { email: user?.email ?? null, actor: "customer" });
  }
  res.cookies.set(ENTRY_COOKIE, name, { maxAge: ENTRY_COOKIE_SECONDS, httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/" });
  return res;
}
