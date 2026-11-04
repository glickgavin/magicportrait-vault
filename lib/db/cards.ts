import "server-only";
import { db, must } from "@/lib/db/client";

export type CardStatus = "rendering" | "ready" | "scheduled" | "emailed" | "opened" | "failed" | "cancelled";

export type CardRow = {
  id: string;
  public_id: string;
  share_slug: string;
  sender_email: string;
  from_name: string;
  to_name: string;
  recipient_email: string | null;
  message: string;
  theme_id: string | null;
  version_id: string | null;
  imagen_session_id: string | null;
  imagen_image_id: string | null;
  portrait_path: string | null;
  crop: { zoom: number; x: number; y: number } | null;
  jpeg_path: string | null;
  delivery: "email" | "self";
  scheduled_for: string | null;
  status: CardStatus;
  share_hidden: boolean;
  render_ms: number | null;
  entry_point: string | null;
  flow: "first" | "full" | null;
  gift_offer_id: string | null;
  reused_from: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export const CARD_COLUMNS = "*";

export async function listCardsBySender(email: string, limit = 200): Promise<CardRow[]> {
  return must(await db().from("cards").select(CARD_COLUMNS).eq("sender_email", email.toLowerCase()).order("created_at", { ascending: false }).limit(limit), "list cards") as CardRow[];
}

export async function countCardsBySender(email: string, since?: string): Promise<number> {
  let q = db().from("cards").select("id", { count: "exact", head: true }).eq("sender_email", email.toLowerCase()).neq("status", "failed");
  if (since) q = q.gte("created_at", since);
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  return r.count ?? 0;
}

export async function getCardById(id: string): Promise<CardRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await db().from("cards").select(CARD_COLUMNS).eq("id", id).maybeSingle()).data as CardRow | null;
}

export async function getCardByPublicId(publicId: string): Promise<CardRow | null> {
  if (!/^C-[0-9a-z]{6}$/.test(publicId)) return null;
  return (await db().from("cards").select(CARD_COLUMNS).eq("public_id", publicId).maybeSingle()).data as CardRow | null;
}

export async function getCardBySlug(slug: string): Promise<CardRow | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(slug)) return null;
  return (await db().from("cards").select(CARD_COLUMNS).eq("share_slug", slug).maybeSingle()).data as CardRow | null;
}

/** A card the signed-in sender owns, or null (same answer for "missing" and "not yours"). */
export async function getOwnedCard(email: string, idOrPublicId: string): Promise<CardRow | null> {
  const card = idOrPublicId.startsWith("C-") ? await getCardByPublicId(idOrPublicId) : await getCardById(idOrPublicId);
  return card && card.sender_email === email.toLowerCase() ? card : null;
}
