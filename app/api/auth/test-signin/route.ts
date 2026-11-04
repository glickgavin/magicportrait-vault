import { z } from "zod";
import { clientIp, hashKey, json, rateLimit } from "@/lib/auth/http";
import { establishSession } from "@/lib/auth/exchange";
import { safeNext } from "@/lib/auth/session";
import { testSignInAllowed } from "@/lib/auth/test-signin";
import { markSignedIn } from "@/lib/db/members";
import { getSetting } from "@/lib/settings";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.email().max(254).transform((e) => e.trim().toLowerCase()), next: z.string().max(500).optional() });

/** Preview-only test sign-in: no code. 404 unless `testSignInAllowed()`. Nothing is sent to Klaviyo. */
export async function POST(req: Request) {
  if (!(await testSignInAllowed())) return new Response("Not found", { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid_email" }, 400);
  const { email, next } = parsed.data;
  if (!(await rateLimit(`test-signin:${hashKey(await clientIp(req))}`, await getSetting("auth.code_ip_rate_limit_per_hour")))) return json({ error: "rate_limited" }, 429);
  if (!(await establishSession(email))) return json({ error: "failed" }, 500);
  await markSignedIn(email);
  await track("vault_test_signin", {}, { email });
  return json({ ok: true, next: safeNext(next, "/") });
}
