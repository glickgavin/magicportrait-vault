import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Signed entry links (e.g. the Shopify invoice email): `?o=<order id or number>&t=<unix seconds>&s=<sig>`
 * where sig = hex HMAC-SHA256(ENTRY_LINK_SECRET, "<o>.<t>"). Shopify's Liquid builds it with
 * `| hmac_sha256: secret`. Valid for `tracking.entry_link_valid_hours` after `t`.
 */
export function entryLinkSecret(): string | undefined {
  // Trimmed: a space or line break pasted into Vercel would otherwise break every signature.
  const s = env.optional("ENTRY_LINK_SECRET")?.trim();
  return s && s.length >= 32 ? s : undefined;
}

/**
 * First 8 hex characters of SHA-256(secret): safe to log, and lets someone holding the key check it's
 * the same one (`printf %s '<key>' | sha256sum | cut -c1-8`) without the key ever being shown.
 */
export function secretFingerprint(secret = entryLinkSecret()): string | null {
  return secret ? createHash("sha256").update(secret).digest("hex").slice(0, 8) : null;
}

export function signEntryLink(secret: string, order: string, t: number): string {
  return createHmac("sha256", secret).update(`${order}.${t}`).digest("hex");
}

export type EntryLinkCheck = { ok: true; order: string } | { ok: false; reason: "missing" | "not_configured" | "malformed" | "bad_signature" | "expired" };

export function checkEntryLink(params: URLSearchParams, validHours: number, now = Date.now(), secret = entryLinkSecret()): EntryLinkCheck {
  const o = params.get("o");
  const t = params.get("t");
  const s = params.get("s");
  if (!o && !t && !s) return { ok: false, reason: "missing" };
  if (!secret) return { ok: false, reason: "not_configured" };
  if (!o || !t || !s || !/^\d{1,20}$/.test(o) || !/^\d{9,11}$/.test(t) || !/^[0-9a-f]{64}$/i.test(s)) return { ok: false, reason: "malformed" };
  const want = Buffer.from(signEntryLink(secret, o, Number(t)), "hex");
  const got = Buffer.from(s.toLowerCase(), "hex");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, reason: "bad_signature" };
  const age = now / 1000 - Number(t);
  // A little leeway for clocks; never more than `validHours` old.
  if (age > validHours * 3600 || age < -300) return { ok: false, reason: "expired" };
  return { ok: true, order: o };
}
