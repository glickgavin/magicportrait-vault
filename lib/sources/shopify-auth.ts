import "server-only";
import { env } from "@/lib/env";

/**
 * Shopify Admin API auth. The r_orders app is a Dev Dashboard app: it has a client id and secret
 * and no permanent token, so we get a token with the client credentials grant (docs/data.md §1):
 *   POST https://{domain}/admin/oauth/access_token  grant_type=client_credentials&client_id&client_secret
 * Tokens last `expires_in` seconds (24 h); we keep one in memory until 5 minutes before that.
 * A permanent SHOPIFY_ADMIN_ACCESS_TOKEN is still accepted when no client id/secret is set.
 */
export type ShopifyAuth =
  | { mode: "client_credentials"; clientId: string; clientSecret: string }
  | { mode: "static_token"; token: string };

export const TOKEN_REFRESH_MARGIN_S = 300;

export interface ShopifyTokenProvider {
  readonly mode: ShopifyAuth["mode"];
  /** A token that is valid now. `fresh` skips the cache (after a 401). */
  get(opts?: { fresh?: boolean }): Promise<string>;
}

/** Client credentials when id + secret are set; else the permanent token; else null (not configured). */
export function shopifyAuthFromEnv(): ShopifyAuth | null {
  const clientId = env.optional("SHOPIFY_CLIENT_ID");
  const clientSecret = env.optional("SHOPIFY_CLIENT_SECRET");
  if (clientId && clientSecret) return { mode: "client_credentials", clientId, clientSecret };
  const token = env.optional("SHOPIFY_ADMIN_ACCESS_TOKEN");
  return token ? { mode: "static_token", token } : null;
}

/** The app's client secret: verifies webhooks (HMAC) and checkout-extension session tokens. */
export function shopifyAppSecret(): string | undefined {
  return env.optional("SHOPIFY_CLIENT_SECRET") ?? env.optional("SHOPIFY_WEBHOOK_SECRET");
}

type Cached = { token: string; refreshAt: number };
// Per process (one warm serverless instance reuses it); keyed by shop + client id.
const g = globalThis as unknown as { __shopifyTokens?: Map<string, Cached>; __shopifyTokenInflight?: Map<string, Promise<string>> };
const cache = (g.__shopifyTokens ??= new Map());
const inflight = (g.__shopifyTokenInflight ??= new Map());

export function clearShopifyTokenCache() {
  cache.clear();
  inflight.clear();
}

export function shopifyTokenProvider(domain: string, auth: ShopifyAuth, fetchImpl: typeof fetch = fetch): ShopifyTokenProvider {
  if (auth.mode === "static_token") return { mode: auth.mode, get: async () => auth.token };
  const key = `${domain}|${auth.clientId}`;
  return {
    mode: auth.mode,
    async get(opts = {}) {
      const hit = cache.get(key);
      if (!opts.fresh && hit && Date.now() < hit.refreshAt) return hit.token;
      if (opts.fresh) cache.delete(key);
      const running = inflight.get(key);
      if (running) return running;
      const p = requestToken(domain, auth, fetchImpl)
        .then(({ token, expiresIn }) => {
          cache.set(key, { token, refreshAt: Date.now() + Math.max(0, expiresIn - TOKEN_REFRESH_MARGIN_S) * 1000 });
          return token;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, p);
      return p;
    },
  };
}

async function requestToken(domain: string, auth: Extract<ShopifyAuth, { mode: "client_credentials" }>, fetchImpl: typeof fetch) {
  const res = await fetchImpl(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: auth.clientId, client_secret: auth.clientSecret }).toString(),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string } | null;
  // Only Shopify's short error code goes into the message (e.g. invalid_client), never the response body.
  if (!res.ok || !body?.access_token) throw new Error(`shopify_token_http_${res.status}${body?.error ? `: ${String(body.error).slice(0, 60)}` : ""}`);
  return { token: body.access_token, expiresIn: Number(body.expires_in) || 86_400 };
}
