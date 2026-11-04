import "server-only";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import type { ImagenSource, MirrorSource, ShopifySource } from "./types";
import { ImagenFixtures, MirrorFixtures, ShopifyFixtures } from "./fixtures";

export type Sources = { shopify: ShopifySource; mirror: MirrorSource; imagen: ImagenSource };

// Fixture instances are process-wide so in-memory writes persist across requests in dev and e2e.
const g = globalThis as unknown as { __vaultFixtures?: { shopify: ShopifyFixtures; mirror: MirrorFixtures; imagen: ImagenFixtures } };
export function fixtureSources() {
  g.__vaultFixtures ??= { shopify: new ShopifyFixtures(), mirror: new MirrorFixtures(), imagen: new ImagenFixtures() };
  return g.__vaultFixtures;
}

export class SourceNotConfigured extends Error {
  constructor(public source: string) {
    super(`${source} is not configured`);
  }
}

/** The live sources (DATA_SOURCE=live) or the fixtures. Live clients are created lazily per call. */
export async function getSources(): Promise<Sources> {
  if (env.dataSource === "fixtures") return fixtureSources();
  const s = await getSettings(["vault.shopify_api_version", "vault.order_search_page_size", "redeem.order_line_items_page_size", "vault.mirror_session_property", "vault.mirror_lptemp_property"] as const);
  const { ShopifyLive } = await import("./shopify-live");
  const { MirrorLive, ImagenLive } = await import("./pg-live");
  const { shopifyAuthFromEnv, shopifyTokenProvider } = await import("./shopify-auth");
  const domain = env.optional("SHOPIFY_STORE_DOMAIN");
  const auth = shopifyAuthFromEnv();
  const mirrorUrl = env.optional("MIRROR_DATABASE_URL");
  const imagenUrl = env.optional("IMAGEGEN_DATABASE_URL");
  return {
    shopify: domain && auth ? new ShopifyLive({ domain, auth: shopifyTokenProvider(domain, auth), apiVersion: s["vault.shopify_api_version"], pageSize: s["vault.order_search_page_size"], linesPageSize: s["redeem.order_line_items_page_size"] }) : unconfigured<ShopifySource>("shopify"),
    mirror: mirrorUrl ? new MirrorLive(mirrorUrl, { session: s["vault.mirror_session_property"], lptemp: s["vault.mirror_lptemp_property"] }) : unconfigured<MirrorSource>("mirror"),
    imagen: imagenUrl ? new ImagenLive(imagenUrl) : unconfigured<ImagenSource>("imagen"),
  };
}

function unconfigured<T extends object>(name: string): T {
  return new Proxy({ kind: "live" } as T, {
    get(target, prop) {
      if (prop === "kind") return "live";
      if (prop === "then") return undefined;
      return async () => {
        throw new SourceNotConfigured(name);
      };
    },
  });
}
