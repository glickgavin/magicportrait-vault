import "server-only";
import type { SessionUser } from "@/lib/auth/types";
import { getSettings } from "@/lib/settings";
import { canSeeShop } from "./access";

/** For existing pages that add a small shop link: true only while the shop is visible to this person. */
export async function shopVisible(user: SessionUser | null): Promise<boolean> {
  try {
    const s = await getSettings(["shop.enabled", "shop.super_user_preview"] as const);
    return canSeeShop({ enabled: s["shop.enabled"], superUserPreview: s["shop.super_user_preview"] }, user);
  } catch {
    return false;
  }
}
