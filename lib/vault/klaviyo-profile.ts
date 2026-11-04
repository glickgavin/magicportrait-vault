import "server-only";
import { getVaultProfile } from "@/lib/vault/profile";
import { countCardsBySender } from "@/lib/db/cards";
import { queueProfileUpdate } from "@/lib/klaviyo";
import { mugPendingCount } from "@/lib/vault/home";
import { track } from "@/lib/track";

/** After sign-in: the portrait lookup event, then the five "My MP" profile properties (never for recipients). */
export async function syncKlaviyoProfile(email: string): Promise<void> {
  try {
    const p = await getVaultProfile(email, { refresh: true });
    await track(p.state === "nobody" ? "vault_lookup_empty" : "vault_lookup_succeeded", { session_count: p.sessions.length, portrait_count: p.portraitCount, orders_count: p.orders.length, is_customer: p.isCustomer, lookup_ms: p.lookupMs }, { email });
    await queueProfileUpdate(email, {
      "My MP Has Free Gift": p.hasFreeGift,
      "My MP Portraits": p.portraitCount,
      "My MP Mug Photo Needed": mugPendingCount(p) > 0,
      "My MP Cards Created": await countCardsBySender(email),
    });
  } catch (e) {
    console.warn(`[klaviyo] profile sync failed: ${(e as Error).message}`);
  }
}
