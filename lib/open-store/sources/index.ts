import "server-only";
import { env } from "@/lib/env";
import { getShopCatalogSource } from "@/lib/shop/sources";
import type { ShopCatalogLive } from "@/lib/shop/sources/live";
import { OpenStoreFixtures } from "./fixtures";
import type { OpenStoreSource } from "./types";

/** The open store's Shopify reads: fixtures under DATA_SOURCE=fixtures, else the live Admin API (shop's client). */
export async function getOpenStoreSource(): Promise<OpenStoreSource> {
  if (env.dataSource === "fixtures") return new OpenStoreFixtures();
  const shop = (await getShopCatalogSource()) as ShopCatalogLive;
  const { OpenStoreLive } = await import("./live");
  return new OpenStoreLive(shop);
}
