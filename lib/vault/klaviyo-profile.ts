import "server-only";
import { getVaultProfile } from "@/lib/vault/profile";
import { countCardsBySender } from "@/lib/db/cards";
import { queueProfileUpdate } from "@/lib/klaviyo";
import { mugPendingCount } from "@/lib/vault/home";

/** The five "My MP" profile properties, for people who signed in (never for recipients). */
export async function syncKlaviyoProfile(email: string): Promise<void> {
  try {
    const p = await getVaultProfile(email);
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
