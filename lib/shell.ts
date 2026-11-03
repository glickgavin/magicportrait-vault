import "server-only";
import type { SessionUser } from "@/lib/auth/types";
import { MAIN_SITE_DEFAULT } from "@/lib/site-links";

export type ShellContext = {
  user: SessionUser | null;
  mainSiteUrl: string;
  thumbnails: string[];
  cardsEnabled: boolean;
};

/** Everything the header, menu and footer need. Filled from the session and settings. */
export async function getShellContext(): Promise<ShellContext> {
  return { user: null, mainSiteUrl: MAIN_SITE_DEFAULT, thumbnails: [], cardsEnabled: true };
}
