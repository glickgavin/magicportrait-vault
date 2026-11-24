import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createVisitor, setVisitorPosthogId, touchVisitor, visitorByHash, type StoreVisitorRow } from "@/lib/db/store";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { decodeFirstTouch, FIRST_TOUCH_COOKIE } from "./first-touch";
import { VISITOR_COOKIE, isVisitorToken } from "./visitor-token";

/** The browser's PostHog id, sent by the store's own API calls (`x-ph-id`), so server events credit the same person. */
export const POSTHOG_ID_HEADER = "x-ph-id";
// Anonymous ids only: once the browser has identified by email, its id is the email, which never goes on the row.
const isPosthogId = (v: string | null): v is string => Boolean(v && /^[A-Za-z0-9._:$+-]{8,200}$/.test(v));

/**
 * The visitor id (docs/open-store.md › The visitor id). The cookie holds a random 32-byte token; the table keeps
 * only HMAC(VISITOR_SECRET, token), so a visitor id seen in an admin page or an order can't act as the visitor.
 */

/** VISITOR_SECRET when set; otherwise a key derived from GIFT_LINK_SECRET for this one purpose (BUILD_LOG › Decisions). */
function visitorKey(): string {
  const own = env.optional("VISITOR_SECRET");
  if (own) {
    if (own.length < 32) throw new Error("VISITOR_SECRET must be 32+ characters");
    return own;
  }
  return createHash("sha256").update(`mmp-visitor:${env.giftLinkSecret}`).digest("base64url");
}

export function visitorTokenHash(token: string): string {
  return createHmac("sha256", visitorKey()).update(token).digest("hex");
}

export function newVisitorToken(): string {
  return randomBytes(32).toString("base64url");
}

async function cookieToken(): Promise<string | null> {
  const v = (await cookies()).get(VISITOR_COOKIE)?.value ?? null;
  return v && isVisitorToken(v) ? v : null;
}

/** This browser's visitor row, or null (no cookie, or no first action yet). Never creates one. */
export async function currentVisitor(): Promise<StoreVisitorRow | null> {
  const token = await cookieToken();
  if (!token) return null;
  return visitorByHash(visitorTokenHash(token));
}

/**
 * This browser's visitor row, created on its first real action (a photo, an Add to cart). A browser without the
 * cookie (it opened the API directly, or blocks cookies until now) gets a new one. Route handlers only.
 */
export async function ensureVisitor(): Promise<StoreVisitorRow> {
  let token = await cookieToken();
  if (!token) {
    token = newVisitorToken();
    const days = (await getSettings(["open_store.visitor_cookie_days"] as const))["open_store.visitor_cookie_days"];
    (await cookies()).set(VISITOR_COOKIE, token, visitorCookieOptions(days, env.appUrl.startsWith("https:")));
  }
  const hash = visitorTokenHash(token);
  const phId = (await headers()).get(POSTHOG_ID_HEADER);
  const jar = await cookies();
  let row = await visitorByHash(hash);
  if (!row) {
    // The first real action: the row takes the first touch kept since the first store page, then the cookie goes.
    row = await createVisitor(hash, { firstTouch: decodeFirstTouch(jar.get(FIRST_TOUCH_COOKIE)?.value), posthogId: isPosthogId(phId) ? phId : null });
    if (jar.get(FIRST_TOUCH_COOKIE)) jar.delete(FIRST_TOUCH_COOKIE);
  } else if (isPosthogId(phId) && phId !== row.posthog_distinct_id) {
    await setVisitorPosthogId(row.id, phId);
    row = { ...row, posthog_distinct_id: phId };
  }
  // At most one write a minute per visitor.
  if (Date.now() - new Date(row.last_seen_at).getTime() > 60_000) await touchVisitor(row.id).catch(() => undefined);
  return row;
}

export function visitorCookieOptions(days: number, secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: Math.round(days * 86400) };
}
