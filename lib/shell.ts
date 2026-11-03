import "server-only";
import type { SessionUser } from "@/lib/auth/types";
import { MAIN_SITE_DEFAULT } from "@/lib/site-links";
import { getSettings } from "@/lib/settings";
import { getSessionUser } from "@/lib/auth/session";

export type ShellContext = {
  user: SessionUser | null;
  mainSiteUrl: string;
  thumbnails: string[];
  cardsEnabled: boolean;
};

/** Everything the header, menu and footer need. Filled from the session and settings. */
export async function getShellContext(given?: SessionUser | null): Promise<ShellContext> {
  const user = given === undefined ? await getSessionUser() : given;
  try {
    const s = await getSettings(["links.main_site_url", "links.menu_thumbnails", "cards.enabled"] as const);
    return { user, mainSiteUrl: s["links.main_site_url"], thumbnails: s["links.menu_thumbnails"], cardsEnabled: s["cards.enabled"] };
  } catch (e) {
    console.error(`[shell] settings unavailable: ${(e as Error).message}`);
    return { user, mainSiteUrl: MAIN_SITE_DEFAULT, thumbnails: [], cardsEnabled: false };
  }
}
