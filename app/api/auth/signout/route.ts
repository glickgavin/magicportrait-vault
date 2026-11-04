import { json } from "@/lib/auth/http";
import { supabaseServer } from "@/lib/auth/supabase-server";
import { getSessionUser } from "@/lib/auth/session";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getSessionUser();
  const sb = await supabaseServer();
  await sb.auth.signOut({ scope: "local" });
  if (user) await track("vault_signed_out", {}, { email: user.email });
  return json({ ok: true });
}
