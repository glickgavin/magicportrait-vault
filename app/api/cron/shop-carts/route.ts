import { cronAuthorized, cronResponse } from "@/lib/cron";
import { expireCarts } from "@/lib/db/shop";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Daily: open shop carts nobody has touched for shop.cart_expiry_days are cleared. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const days = (await getSettings(["shop.cart_expiry_days"] as const))["shop.cart_expiry_days"];
  try {
    return cronResponse({ expired: await expireCarts(days) });
  } catch (e) {
    // Before the shop migration is applied the tables don't exist; nothing to do.
    return cronResponse({ expired: 0, skipped: (e as Error).message.slice(0, 80) });
  }
}
