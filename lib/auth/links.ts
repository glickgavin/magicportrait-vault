import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db, must } from "@/lib/db/client";
import { env } from "@/lib/env";

export type LinkPurpose = "gift_offer" | "admin_resend" | "mug_reminder" | "gift_reminder";

/** 32 random bytes, base64url (43 chars). Never contains the email or the order number. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHmac("sha256", env.giftLinkSecret).update(token).digest("hex");
}

export function looksLikeToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export async function createSigninLink(input: {
  email: string;
  purpose: LinkPurpose;
  validDays: number;
  redirectPath?: string;
  giftOfferId?: string | null;
  orderLegacyId?: string | null;
  createdBy?: string;
}): Promise<{ token: string; url: string; expiresAt: string; tokenHash: string }> {
  const token = newToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + input.validDays * 86_400_000).toISOString();
  must(
    await db()
      .from("signin_links")
      .insert({
        token_hash: tokenHash,
        email: input.email.toLowerCase().trim(),
        purpose: input.purpose,
        redirect_path: input.redirectPath ?? "/create",
        gift_offer_id: input.giftOfferId ?? null,
        order_legacy_id: input.orderLegacyId ?? null,
        expires_at: expiresAt,
        created_by: input.createdBy ?? "system",
      })
      .select("id"),
    "create signin link",
  );
  return { token, url: `${env.appUrl}/g/${token}`, expiresAt, tokenHash };
}

export type LinkRow = {
  id: string;
  email: string;
  purpose: LinkPurpose;
  redirect_path: string;
  gift_offer_id: string | null;
  order_legacy_id: string | null;
  expires_at: string;
  first_used_at: string | null;
  use_count: number;
};

export type ConsumeResult = { status: "ok"; link: LinkRow; firstUse: boolean } | { status: "expired"; link: LinkRow } | { status: "unknown" };

/** Looks a token up by its hash. Valid until it expires (it may be used more than once before then). */
export async function consumeSigninLink(token: string, now = new Date()): Promise<ConsumeResult> {
  if (!looksLikeToken(token)) return { status: "unknown" };
  const h = hashToken(token);
  const r = await db().from("signin_links").select("id, email, purpose, redirect_path, gift_offer_id, order_legacy_id, expires_at, first_used_at, use_count, token_hash").eq("token_hash", h).maybeSingle();
  const row = r.data as (LinkRow & { token_hash: string }) | null;
  if (!row || !timingSafeEqual(Buffer.from(row.token_hash), Buffer.from(h))) return { status: "unknown" };
  if (new Date(row.expires_at).getTime() <= now.getTime()) return { status: "expired", link: row };
  const firstUse = !row.first_used_at;
  await db()
    .from("signin_links")
    .update({ first_used_at: row.first_used_at ?? now.toISOString(), last_used_at: now.toISOString(), use_count: row.use_count + 1 })
    .eq("id", row.id);
  return { status: "ok", link: row, firstUse };
}
