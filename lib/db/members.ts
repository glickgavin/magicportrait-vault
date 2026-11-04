import "server-only";
import { db, must } from "@/lib/db/client";

export type MemberRow = {
  id: string;
  email: string;
  created_via: "sign_in" | "gift_offer" | "admin_lookup";
  first_signed_in_at: string | null;
  display_name: string | null;
  shopify_customer_id: string | null;
  is_customer: boolean;
  first_order_at: string | null;
  imagen_sessions: { imagen_session_id: string; lptemp_session_id: string | null }[];
  portrait_count: number | null;
  lookup_refreshed_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

export async function getMember(email: string): Promise<MemberRow | null> {
  const r = await db().from("vault_members").select("*").eq("email", email.toLowerCase()).maybeSingle();
  return must(r, "get member") as MemberRow | null;
}

export async function getMemberById(id: string): Promise<MemberRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await db().from("vault_members").select("*").eq("id", id).maybeSingle();
  return must(r, "get member by id") as MemberRow | null;
}

/** Creates the row if missing (keeping the first created_via), then applies the patch. */
export async function upsertMember(email: string, createdVia: MemberRow["created_via"], patch: Partial<MemberRow> = {}): Promise<MemberRow> {
  const e = email.toLowerCase().trim();
  await db().from("vault_members").upsert({ email: e, created_via: createdVia }, { onConflict: "email", ignoreDuplicates: true });
  const r = await db()
    .from("vault_members")
    .update({ ...patch, last_seen_at: new Date().toISOString() })
    .eq("email", e)
    .select("*")
    .single();
  return must(r, "upsert member") as MemberRow;
}

export async function markSignedIn(email: string) {
  const m = await upsertMember(email, "sign_in");
  if (!m.first_signed_in_at) await db().from("vault_members").update({ first_signed_in_at: new Date().toISOString() }).eq("email", m.email);
  return m;
}

export async function searchMembers(q: string, limit = 20): Promise<MemberRow[]> {
  const term = q.trim().toLowerCase().replace(/[%_,()]/g, " ").trim();
  if (!term) return [];
  const r = await db()
    .from("vault_members")
    .select("*")
    .or(`email.ilike.%${term}%,display_name.ilike.%${term}%`)
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  return must(r, "search members") as MemberRow[];
}
