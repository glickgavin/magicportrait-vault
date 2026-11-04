import { describe, expect, it } from "vitest";
import { consumeSigninLink, createSigninLink, hashToken, looksLikeToken, newToken } from "@/lib/auth/links";
import { db } from "@/lib/db/client";
import { safeNext } from "@/lib/auth/session";

describe("one-tap sign-in links", () => {
  it("tokens are random, 32 bytes, url-safe, and stored only as an HMAC", async () => {
    const a = newToken();
    const b = newToken();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(looksLikeToken(a)).toBe(true);
    const link = await createSigninLink({ email: "Sam@Example.com", purpose: "admin_resend", validDays: 30 });
    const row = (await db().from("signin_links").select("*").eq("token_hash", link.tokenHash).single()).data as Record<string, unknown>;
    expect(row.token_hash).toBe(hashToken(link.token));
    expect(JSON.stringify(row)).not.toContain(link.token);
    expect(link.url).toMatch(/\/g\/[A-Za-z0-9_-]{43}$/);
    expect(link.url).not.toContain("sam");
  });

  it("valid", async () => {
    const link = await createSigninLink({ email: "sam@example.com", purpose: "gift_offer", validDays: 30 });
    const r = await consumeSigninLink(link.token);
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.link.email).toBe("sam@example.com");
      expect(r.firstUse).toBe(true);
    }
    const again = await consumeSigninLink(link.token);
    expect(again.status).toBe("ok");
    if (again.status === "ok") expect(again.firstUse).toBe(false);
  });

  it("expired", async () => {
    const link = await createSigninLink({ email: "sam@example.com", purpose: "gift_offer", validDays: 30 });
    const later = new Date(Date.now() + 31 * 86_400_000);
    expect((await consumeSigninLink(link.token, later)).status).toBe("expired");
  });

  it("unknown and malformed", async () => {
    expect((await consumeSigninLink(newToken())).status).toBe("unknown");
    expect((await consumeSigninLink("short")).status).toBe("unknown");
    expect((await consumeSigninLink("x".repeat(43) + "'; drop table"))).toEqual({ status: "unknown" });
  });

  it("reused after expiry fails even though it worked before", async () => {
    const link = await createSigninLink({ email: "sam@example.com", purpose: "gift_offer", validDays: 1 });
    expect((await consumeSigninLink(link.token)).status).toBe("ok");
    expect((await consumeSigninLink(link.token, new Date(Date.now() + 2 * 86_400_000))).status).toBe("expired");
  });

  it("safeNext only allows same-site paths", () => {
    expect(safeNext("/orders/1001")).toBe("/orders/1001");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("/g/abc")).toBe("/");
    expect(safeNext(undefined, "/create")).toBe("/create");
  });
});
