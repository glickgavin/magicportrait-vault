import { createClient } from "@supabase/supabase-js";
import { codeRequestSchema } from "@/lib/auth/schemas";
import { clientIp, hashKey, json, rateLimit } from "@/lib/auth/http";
import { getSettings } from "@/lib/settings";
import { track } from "@/lib/track";
import { env } from "@/lib/env";
import { maskEmail } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Sends a 6-digit code. Always answers the same way, so it never reveals whether an email is known. */
export async function POST(req: Request) {
  const parsed = codeRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid_email" }, 400);
  const { email } = parsed.data;
  const s = await getSettings(["auth.code_rate_limit_per_hour", "auth.code_ip_rate_limit_per_hour"] as const);
  const ip = await clientIp();
  const okEmail = await rateLimit(`code:${hashKey(email)}`, s["auth.code_rate_limit_per_hour"]);
  const okIp = await rateLimit(`code-ip:${hashKey(ip)}`, s["auth.code_ip_rate_limit_per_hour"]);
  if (!okEmail || !okIp) return json({ error: "rate_limited" }, 429);

  const sb = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) {
    console.error(`[auth] code send failed for ${maskEmail(email)}: ${error.status ?? ""} ${error.code ?? ""}`);
    if (error.status === 429) return json({ error: "rate_limited" }, 429);
    return json({ error: "send_failed" }, 502);
  }
  await track("vault_code_requested", {}, { email });
  return json({ ok: true });
}
