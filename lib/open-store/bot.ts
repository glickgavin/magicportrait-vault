import "server-only";
import { env } from "@/lib/env";

/**
 * The bot check on creating a picture (docs/open-store.md › Limits): Vercel BotID. Off the Vercel platform
 * (local dev, tests) BotID always says "human", so the limits still apply there. Never throws: if the check
 * itself fails, the request goes on to the limits.
 */
export async function isBotRequest(): Promise<boolean> {
  if (env.dataSource === "fixtures") return false;
  try {
    const { checkBotId } = await import("botid/server");
    const r = await checkBotId();
    return r.isBot;
  } catch (e) {
    console.error(`[open-store] bot check failed: ${(e as Error).message}`);
    return false;
  }
}
