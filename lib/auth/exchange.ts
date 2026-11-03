import "server-only";
import { db } from "@/lib/db/client";
import { supabaseServer } from "./supabase-server";

/**
 * Server-side session exchange for a verified one-tap link: mint a magic-link token with the
 * admin API and verify it straight away, which sets the auth cookies. Nothing is emailed.
 */
export async function establishSession(email: string): Promise<boolean> {
  const admin = db().auth.admin;
  // For someone new this returns a "signup" token; verifying with type "email" accepts both kinds.
  const gen = await admin.generateLink({ type: "magiclink", email });
  const hashed = gen.data?.properties?.hashed_token;
  if (gen.error || !hashed) return false;
  const sb = await supabaseServer();
  const { error } = await sb.auth.verifyOtp({ type: "email", token_hash: hashed });
  if (error) console.error(`[auth] link exchange failed: ${error.code ?? error.message}`);
  return !error;
}
