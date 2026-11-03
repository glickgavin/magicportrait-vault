import { codeVerifySchema } from "@/lib/auth/schemas";
import { hashKey, json, rateLimit } from "@/lib/auth/http";
import { supabaseServer } from "@/lib/auth/supabase-server";
import { safeNext } from "@/lib/auth/session";
import { markSignedIn } from "@/lib/db/members";
import { getSetting } from "@/lib/settings";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = codeVerifySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid_code" }, 400);
  const { email, code, next } = parsed.data;
  if (!(await rateLimit(`verify:${hashKey(email)}`, await getSetting("auth.verify_rate_limit_per_hour")))) return json({ error: "rate_limited" }, 429);

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) {
    await track("vault_code_failed", { reason: error?.code ?? "invalid" }, { email });
    return json({ error: "invalid_code" }, 400);
  }
  await markSignedIn(email);
  await track("vault_code_verified", {}, { email });
  await track("vault_signed_in", { method: "code" }, { email });
  return json({ ok: true, next: safeNext(next, "/") });
}
