import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearShopifyTokenCache, shopifyAppSecret, shopifyAuthFromEnv, shopifyTokenProvider, shopifyWebhookSecrets } from "@/lib/sources/shopify-auth";
import { ShopifyLive } from "@/lib/sources/shopify-live";

const CC = { mode: "client_credentials" as const, clientId: "cid", clientSecret: "csecret" };
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function tokenFetch(tokens: string[], expiresIn = 86_399) {
  let i = 0;
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ok({ access_token: tokens[Math.min(i++, tokens.length - 1)], scope: "read_orders", expires_in: expiresIn }));
}

describe("shopify auth", () => {
  const saved = { ...process.env };
  beforeEach(() => clearShopifyTokenCache());
  afterEach(() => {
    process.env = { ...saved };
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("requests a token with the client credentials grant (form body)", async () => {
    const f = tokenFetch(["t1"]);
    const p = shopifyTokenProvider("shop.myshopify.com", CC, f as unknown as typeof fetch);
    expect(await p.get()).toBe("t1");
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://shop.myshopify.com/admin/oauth/access_token");
    expect((init!.headers as Record<string, string>)["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(new URLSearchParams(String(init!.body)))).toEqual({ grant_type: "client_credentials", client_id: "cid", client_secret: "csecret" });
  });

  it("caches until 5 minutes before expiry, then refreshes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T00:00:00Z"));
    const f = tokenFetch(["t1", "t2"], 86_400);
    const p = shopifyTokenProvider("shop.myshopify.com", CC, f as unknown as typeof fetch);
    expect(await p.get()).toBe("t1");
    vi.setSystemTime(new Date(Date.parse("2026-11-04T00:00:00Z") + (86_400 - 301) * 1000));
    expect(await p.get()).toBe("t1");
    expect(f).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(Date.parse("2026-11-04T00:00:00Z") + (86_400 - 299) * 1000));
    expect(await p.get()).toBe("t2");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("shares one token request between concurrent callers", async () => {
    const f = tokenFetch(["t1"]);
    const p = shopifyTokenProvider("shop.myshopify.com", CC, f as unknown as typeof fetch);
    expect(await Promise.all([p.get(), p.get(), p.get()])).toEqual(["t1", "t1", "t1"]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("reports only Shopify's error code when the grant fails", async () => {
    const f = vi.fn(async () => ok({ error: "invalid_client", error_description: "secret details here" }, 400));
    const p = shopifyTokenProvider("shop.myshopify.com", CC, f as unknown as typeof fetch);
    await expect(p.get()).rejects.toThrow(/^shopify_token_http_400: invalid_client$/);
  });

  it("GraphQL 401 → one fresh token and one retry, then gives up", async () => {
    const tokens = tokenFetch(["old", "new"]);
    const p = shopifyTokenProvider("shop.myshopify.com", CC, tokens as unknown as typeof fetch);
    const seen: string[] = [];
    const gql = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      const t = (init!.headers as Record<string, string>)["x-shopify-access-token"];
      seen.push(t);
      return t === "new" ? ok({ data: { shop: { name: "S", myshopifyDomain: "shop.myshopify.com" }, currentAppInstallation: { accessScopes: [{ handle: "read_orders" }] } } }) : new Response("", { status: 401 });
    });
    vi.stubGlobal("fetch", gql);
    const live = new ShopifyLive({ domain: "shop.myshopify.com", auth: p, apiVersion: "2025-07", pageSize: 25, linesPageSize: 50 });
    const r = await live.ping();
    expect(seen).toEqual(["old", "new"]);
    expect(r).toMatchObject({ shop: "S", auth: "client_credentials" });

    // Always 401: exactly one retry, then the error.
    clearShopifyTokenCache();
    seen.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      seen.push((init!.headers as Record<string, string>)["x-shopify-access-token"]);
      return new Response("", { status: 401 });
    }));
    const p2 = shopifyTokenProvider("shop.myshopify.com", CC, tokenFetch(["a", "b", "c"]) as unknown as typeof fetch);
    await expect(new ShopifyLive({ domain: "shop.myshopify.com", auth: p2, apiVersion: "2025-07", pageSize: 25, linesPageSize: 50 }).ping()).rejects.toThrow("shopify_http_401");
    expect(seen).toEqual(["a", "b"]);
  });

  it("a static token is used as is, with no token request and no retry", async () => {
    const p = shopifyTokenProvider("shop.myshopify.com", { mode: "static_token", token: "shpat_x" });
    expect(await p.get()).toBe("shpat_x");
    expect(await p.get({ fresh: true })).toBe("shpat_x");
  });

  it("env: client id + secret win; else the permanent token; secret falls back to the old name", () => {
    process.env.SHOPIFY_CLIENT_ID = "cid";
    process.env.SHOPIFY_CLIENT_SECRET = "csecret";
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = "shpat_x";
    expect(shopifyAuthFromEnv()).toEqual(CC);
    expect(shopifyAppSecret()).toBe("csecret");
    delete process.env.SHOPIFY_CLIENT_ID;
    expect(shopifyAuthFromEnv()).toEqual({ mode: "static_token", token: "shpat_x" });
    delete process.env.SHOPIFY_CLIENT_SECRET;
    delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    expect(shopifyAuthFromEnv()).toBeNull();
    process.env.SHOPIFY_WEBHOOK_SECRET = "store-key";
    expect(shopifyAppSecret()).toBeUndefined();
    expect(shopifyWebhookSecrets()).toEqual(["store-key"]);
    process.env.SHOPIFY_CLIENT_SECRET = "csecret";
    expect(shopifyWebhookSecrets()).toEqual(["csecret", "store-key"]);
  });
});
