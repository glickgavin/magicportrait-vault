import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/** Supabase client bound to the request's auth cookies (route handlers, server components, actions). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, { ...options, sameSite: "lax", secure: env.appUrl.startsWith("https") });
        } catch {
          // Called from a server component: cookies are read-only there; proxy.ts refreshes them.
        }
      },
    },
  });
}
