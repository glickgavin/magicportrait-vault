import { createHmac, timingSafeEqual } from "node:crypto";

/** `X-Shopify-Hmac-Sha256`: base64 HMAC-SHA256 of the raw body with the app secret (docs/data.md §5.6). */
export function verifyShopifyHmac(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const want = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  let got: Buffer;
  try {
    got = Buffer.from(header, "base64");
  } catch {
    return false;
  }
  return got.length === want.length && timingSafeEqual(got, want);
}

export type SessionClaims = { iss?: string; dest?: string; aud?: string; sub?: string; exp?: number; nbf?: number; iat?: number; jti?: string; sid?: string };

const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/**
 * Verifies a Shopify checkout UI extension session token (HS256 JWT signed with the app secret).
 * Returns the claims, or null when the signature, algorithm, timing or shop doesn't match.
 */
export function verifySessionToken(token: string, secret: string, opts: { shopDomain?: string; now?: Date; leewaySeconds?: number } = {}): SessionClaims | null {
  if (!secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(b64url(parts[0]).toString("utf8")) as { alg?: string; typ?: string };
    if (header.alg !== "HS256") return null;
    const want = createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
    const got = b64url(parts[2]);
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    const claims = JSON.parse(b64url(parts[1]).toString("utf8")) as SessionClaims;
    const now = Math.floor((opts.now ?? new Date()).getTime() / 1000);
    const leeway = opts.leewaySeconds ?? 10;
    if (typeof claims.exp !== "number" || claims.exp + leeway < now) return null;
    if (typeof claims.nbf === "number" && claims.nbf - leeway > now) return null;
    if (opts.shopDomain) {
      const dest = (claims.dest ?? "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (dest !== opts.shopDomain) return null;
    }
    return claims;
  } catch {
    return null;
  }
}

/** For tests and the fixture shop: signs a token the way Shopify does. */
export function signSessionToken(claims: SessionClaims, secret: string): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg: "HS256", typ: "JWT" });
  const body = enc(claims);
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
