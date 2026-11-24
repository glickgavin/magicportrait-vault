import "server-only";
import { db } from "@/lib/db/client";
import { getSettings } from "@/lib/settings";
import { canSeeOpenStore } from "./access";

/** For the proxy: whether the open store is visible to this signed-in email (or a visitor). Hidden on failure. */
export async function openStoreVisibleTo(email: string | null): Promise<boolean> {
  try {
    const s = await getSettings(["open_store.enabled", "open_store.super_user_preview"] as const);
    if (s["open_store.enabled"]) return true;
    if (!s["open_store.super_user_preview"] || !email) return false;
    const sup = await db().rpc("is_super_user", { p_email: email.toLowerCase() });
    return canSeeOpenStore({ enabled: false, superUserPreview: true }, { isSuperUser: sup.data === true });
  } catch {
    return false;
  }
}
