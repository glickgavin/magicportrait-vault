import "server-only";
import { db } from "@/lib/db/client";
import { countCardsBySender } from "@/lib/db/cards";
import type { PersonProps } from "@/components/Identify";

export async function personProps(email: string): Promise<PersonProps> {
  const [m, cards] = await Promise.all([
    db().from("vault_members").select("is_customer, first_order_at, portrait_count, imagen_sessions, first_seen_at").eq("email", email).maybeSingle(),
    countCardsBySender(email).catch(() => 0),
  ]);
  const r = m.data as { is_customer: boolean; first_order_at: string | null; portrait_count: number | null; imagen_sessions: unknown[]; first_seen_at: string } | null;
  return { email, is_customer: r?.is_customer ?? false, first_order_at: r?.first_order_at ?? null, portrait_count: r?.portrait_count ?? null, session_count: r?.imagen_sessions?.length ?? 0, cards_created: cards, vault_first_seen_at: r?.first_seen_at ?? null };
}
