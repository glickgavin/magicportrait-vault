import "server-only";
import { env } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { SourceNotConfigured } from "@/lib/sources";
import { ShopCatalogFixtures } from "./fixtures";
import type { ShopCatalogSource } from "./types";

// One fixtures instance per process, so in-memory writes persist across requests in dev and e2e.
const g = globalThis as unknown as { __shopFixtures?: ShopCatalogFixtures };
export function shopFixtures(): ShopCatalogFixtures {
  g.__shopFixtures ??= new ShopCatalogFixtures();
  return g.__shopFixtures;
}

/** The shop's Shopify source: fixtures under DATA_SOURCE=fixtures, else the live Admin API. */
export async function getShopCatalogSource(): Promise<ShopCatalogSource> {
  if (env.dataSource === "fixtures") return shopFixtures();
  const domain = env.optional("SHOPIFY_STORE_DOMAIN");
  const { shopifyAuthFromEnv, shopifyTokenProvider } = await import("@/lib/sources/shopify-auth");
  const auth = shopifyAuthFromEnv();
  if (!domain || !auth) throw new SourceNotConfigured("shopify");
  const { ShopCatalogLive } = await import("./live");
  return new ShopCatalogLive({ domain, auth: shopifyTokenProvider(domain, auth), apiVersion: await getSetting("vault.shopify_api_version") });
}
