import "server-only";
import type { SessionUser } from "@/lib/auth/types";
import { db } from "@/lib/db/client";
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

/** For the proxy: the same rule from just the signed-in email (or none). Never throws: hidden on failure. */
export async function shopVisibleTo(email: string | null): Promise<boolean> {
  try {
    const s = await getSettings(["shop.enabled", "shop.super_user_preview"] as const);
    if (s["shop.enabled"]) return true;
    if (!s["shop.super_user_preview"] || !email) return false;
    const sup = await db().rpc("is_super_user", { p_email: email.toLowerCase() });
    return sup.data === true;
  } catch {
    return false;
  }
}
