import { getSessionUser } from "@/lib/auth/session";
import { clientIp, hashKey, json, rateLimit } from "@/lib/auth/http";
import { getSettings } from "@/lib/settings";
import { getVaultProfile } from "@/lib/vault/profile";
import { clientSessions } from "@/lib/cards/builder-data";

export const dynamic = "force-dynamic";

/** Every session of the signed-in person, for "Show more" in the card builder's pickers. Their own only. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const max = (await getSettings(["vault.lookup_rate_limit_per_hour"] as const))["vault.lookup_rate_limit_per_hour"];
  const [a, b] = await Promise.all([rateLimit(`portraits:${hashKey(user.email)}`, max), rateLimit(`portraits-ip:${hashKey(await clientIp(req))}`, max * 3)]);
  if (!a || !b) return json({ error: "rate_limited" }, 429);
  const profile = await getVaultProfile(user.email, { all: true });
  return json({ sessions: clientSessions(profile.sessions) }, 200, { "cache-control": "private, no-store" });
}
