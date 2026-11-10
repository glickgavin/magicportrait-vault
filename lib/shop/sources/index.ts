import "server-only";
import { env } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { SourceNotConfigured } from "@/lib/sources";
import { ShopCatalogFixtures } from "./fixtures";
import { ShopImagesFixtures, type ShopImagesSource } from "./images";
import type { ShopCatalogSource } from "./types";

// One fixtures instance per process, so in-memory writes persist across requests in dev and e2e.
const g = globalThis as unknown as { __shopFixtures?: ShopCatalogFixtures; __shopImageFixtures?: ShopImagesFixtures };
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

/** Past photos from the events mirror: fixtures, or the live mirror through vault_reader. */
export async function getShopImagesSource(): Promise<ShopImagesSource> {
  if (env.dataSource === "fixtures") {
    g.__shopImageFixtures ??= new ShopImagesFixtures();
    return g.__shopImageFixtures;
  }
  const url = env.optional("MIRROR_DATABASE_URL");
  if (!url) throw new SourceNotConfigured("mirror");
  const { ShopImagesLive } = await import("./images-live");
  return new ShopImagesLive(url);
}
