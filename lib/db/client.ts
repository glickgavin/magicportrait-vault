import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let admin: SupabaseClient | null = null;

/**
 * The service-role client. Only code in lib/db (and a few storage helpers) uses it; RLS denies
 * everything else. Never import this from a client component.
 */
export function db(): SupabaseClient {
  if (!admin) {
    admin = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { "x-client-info": "magic-vault-server" } },
    });
  }
  return admin;
}

export class DbError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) throw new DbError(`${what}: ${res.error.message}`, res.error.code);
  return res.data as T;
}
