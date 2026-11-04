import "server-only";
import { getSources } from "@/lib/sources";
import type { ShopifyOrder } from "@/lib/sources/types";

/** §6.1: an order belongs to E when E matches the order email or the customer's default email. */
export function ownsOrder(order: Pick<ShopifyOrder, "email" | "customer">, email: string): boolean {
  const e = email.trim().toLowerCase();
  return (order.email ?? "").toLowerCase() === e || (order.customer?.email ?? "").toLowerCase() === e;
}

/**
 * Re-reads the order live and checks ownership. Returns null for "not found" and "not yours" alike,
 * so callers can't tell them apart (no enumeration).
 */
export async function findOwnedOrder(email: string, orderParam: string): Promise<ShopifyOrder | null> {
  const p = orderParam.trim().replace(/^#/, "");
  if (!/^[A-Za-z0-9-]{1,30}$/.test(p)) return null;
  const { shopify } = await getSources();
  try {
    let order: ShopifyOrder | null = null;
    if (/^\d{10,}$/.test(p)) order = await shopify.orderById(p);
    else {
      const ref = await shopify.resolveOrderByName(p);
      if (ref) order = await shopify.orderById(ref.id);
    }
    if (!order || order.test || !ownsOrder(order, email)) return null;
    return order;
  } catch (e) {
    console.error(`[redeem] order lookup failed: ${(e as Error).message}`);
    return null;
  }
}
