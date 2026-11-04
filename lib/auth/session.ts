import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "./supabase-server";
import { db } from "@/lib/db/client";
import { firstName, initialsFor } from "@/lib/utils";
import type { SessionUser } from "./types";

/** The signed-in person, verified with the auth server. Memoised per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const sb = await supabaseServer();
    const { data, error } = await sb.auth.getUser();
    const email = data.user?.email?.toLowerCase();
    if (error || !email) return null;
    const [member, sup] = await Promise.all([
      db().from("vault_members").select("display_name").eq("email", email).maybeSingle(),
      db().rpc("is_super_user", { p_email: email }),
    ]);
    const name = (member.data as { display_name: string | null } | null)?.display_name ?? null;
    return { email, name, firstName: firstName(name), initials: initialsFor(name, email), isSuperUser: sup.data === true };
  } catch {
    return null;
  }
});

/** Pages that need a signed-in person: send them to sign-in, then back. */
export async function requireUser(next: string): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect(`/signin?next=${encodeURIComponent(safeNext(next))}`);
  return u;
}

/** /settings/* and /api/admin/*: 404 unless is_super_user(email). */
export async function requireSuperUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u?.isSuperUser) notFound();
  return u;
}

export async function superUserOrNull(): Promise<SessionUser | null> {
  const u = await getSessionUser();
  return u?.isSuperUser ? u : null;
}

/** Only same-site relative paths, never a protocol-relative or absolute URL. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/^\/(g|api)\//.test(next)) return fallback;
  return next.slice(0, 300);
}
