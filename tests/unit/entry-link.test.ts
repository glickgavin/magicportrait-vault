import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { checkEntryLink, entryLinkSecret, secretFingerprint, signEntryLink } from "@/lib/auth/entry-link";

const SECRET = "test-entry-link-secret-0123456789abcdef0123456789";
const NOW = Date.UTC(2026, 10, 8, 12) ;
const t = Math.floor(NOW / 1000) - 3600; // email made an hour ago
const params = (o: string, tt: number, s: string) => new URLSearchParams({ o, t: String(tt), s });

describe("signed entry links (invoice email)", () => {
  it("matches what Shopify's Liquid hmac_sha256 produces (hex of HMAC-SHA256 over '<order>.<time>')", () => {
    // Liquid: {{ '6123456789012.1762600000' | hmac_sha256: secret }} gives this same lowercase hex.
    expect(signEntryLink(SECRET, "6123456789012", 1762600000)).toBe(createHmac("sha256", SECRET).update("6123456789012.1762600000").digest("hex"));
    expect(createHmac("sha256", "abc").update("hello").digest("hex")).toBe("f3166a3a404599d2046ed2aae479b37d54b51d2e85259c9e314042753be7d813");
  });
  it("accepts a fresh, correctly signed link", () => {
    const s = signEntryLink(SECRET, "6123456789012", t);
    expect(checkEntryLink(params("6123456789012", t, s), 24, NOW, SECRET)).toEqual({ ok: true, order: "6123456789012" });
    expect(checkEntryLink(params("6123456789012", t, s.toUpperCase()), 24, NOW, SECRET).ok).toBe(true);
  });
  it("refuses an expired link (older than the valid hours)", () => {
    const old = Math.floor(NOW / 1000) - 25 * 3600;
    expect(checkEntryLink(params("6123456789012", old, signEntryLink(SECRET, "6123456789012", old)), 24, NOW, SECRET)).toEqual({ ok: false, reason: "expired" });
  });
  it("refuses a changed order, a changed time, or the wrong secret", () => {
    const s = signEntryLink(SECRET, "6123456789012", t);
    expect(checkEntryLink(params("6123456789013", t, s), 24, NOW, SECRET)).toEqual({ ok: false, reason: "bad_signature" });
    expect(checkEntryLink(params("6123456789012", t + 3000, s), 24, NOW, SECRET)).toEqual({ ok: false, reason: "bad_signature" });
    expect(checkEntryLink(params("6123456789012", t, signEntryLink("another-secret-0123456789abcdef012345", "6123456789012", t)), 24, NOW, SECRET)).toEqual({ ok: false, reason: "bad_signature" });
  });
  it("is just a tracked click without a signature, or when the secret isn't set", () => {
    expect(checkEntryLink(new URLSearchParams(), 24, NOW, SECRET)).toEqual({ ok: false, reason: "missing" });
    expect(checkEntryLink(params("1", t, "a".repeat(64)), 24, NOW, "")).toEqual({ ok: false, reason: "not_configured" });
    expect(checkEntryLink(params("12; drop", t, "x"), 24, NOW, SECRET)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("entry link secret", () => {
  it("ignores spaces and line breaks around the key, and fingerprints it without revealing it", () => {
    const before = process.env.ENTRY_LINK_SECRET;
    process.env.ENTRY_LINK_SECRET = `  ${SECRET}\n`;
    try {
      expect(entryLinkSecret()).toBe(SECRET);
      expect(secretFingerprint()).toBe(secretFingerprint(SECRET));
      expect(secretFingerprint(SECRET)).toMatch(/^[0-9a-f]{8}$/);
    } finally {
      process.env.ENTRY_LINK_SECRET = before;
    }
  });
});
