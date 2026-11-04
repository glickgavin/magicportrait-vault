import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { removeObjects } from "@/lib/storage";
import { track } from "@/lib/track";
import type { CardRow } from "@/lib/db/cards";

export const cardFilters = z.object({
  q: z.string().trim().max(120).optional().default(""),
  category: z.string().max(40).optional().default(""),
  status: z.string().max(20).optional().default(""),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).default(""),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).default(""),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export type CardFilters = z.infer<typeof cardFilters>;
export const PAGE_SIZE = 25;

export type AdminCardRow = Pick<CardRow, "id" | "public_id" | "created_at" | "sender_email" | "from_name" | "to_name" | "status" | "delivery" | "scheduled_for" | "share_hidden" | "jpeg_path"> & { theme: string | null; version: string | null; category: string | null };

export async function listAdminCards(f: CardFilters, limit = PAGE_SIZE): Promise<{ rows: AdminCardRow[]; total: number }> {
  let q = db()
    .from("cards")
    .select("id, public_id, created_at, sender_email, from_name, to_name, status, delivery, scheduled_for, share_hidden, jpeg_path, themes!inner(name, theme_categories!inner(slug, name)), theme_versions(name)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (f.q) {
    const s = f.q.toLowerCase().replace(/[%_,()]/g, " ").trim();
    q = q.or(`to_name.ilike.%${s}%,from_name.ilike.%${s}%,sender_email.ilike.%${s}%,public_id.ilike.%${s}%`);
  }
  if (f.status) q = q.eq("status", f.status);
  if (f.category) q = q.eq("themes.theme_categories.slug", f.category);
  if (f.from) q = q.gte("created_at", `${f.from}T00:00:00Z`);
  if (f.to) q = q.lt("created_at", new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86_400_000).toISOString());
  const r = await q.range((f.page - 1) * limit, f.page * limit - 1);
  if (r.error) throw new Error(r.error.message);
  type Raw = Omit<AdminCardRow, "theme" | "version" | "category"> & { themes: { name: string; theme_categories: { name: string } } | null; theme_versions: { name: string } | null };
  return {
    total: r.count ?? 0,
    rows: ((r.data ?? []) as unknown as Raw[]).map(({ themes, theme_versions, ...c }) => ({ ...c, theme: themes?.name ?? null, version: theme_versions?.name ?? null, category: themes?.theme_categories?.name ?? null })),
  };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // no formula injection
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** CSV of the filtered cards (no message text or recipient email). */
export async function cardsCsv(f: CardFilters, by: string): Promise<{ csv: string; rows: number }> {
  const all: AdminCardRow[] = [];
  for (let page = 1; page <= 200; page++) {
    const r = await listAdminCards({ ...f, page }, 500);
    all.push(...r.rows);
    if (r.rows.length < 500) break;
  }
  const head = ["card_id", "created_at", "sender_email", "from_name", "to_name", "category", "theme", "version", "status", "delivery", "scheduled_for", "link_hidden"];
  const lines = [head.join(","), ...all.map((c) => [c.public_id, c.created_at, c.sender_email, c.from_name, c.to_name, c.category, c.theme, c.version, c.status, c.delivery, c.scheduled_for, c.share_hidden].map(csvCell).join(","))];
  await track("admin_cards_exported", { row_count: all.length, filters: JSON.stringify({ ...f, q: f.q ? "(search)" : "" }) }, { email: by, actor: `super_user:${by}` });
  return { csv: lines.join("\n") + "\n", rows: all.length };
}

/** A single card's detail for support (opening it is logged: it shows the message). */
export async function adminCardDetail(id: string, by: string) {
  const c = (await db().from("cards").select("*, themes(name, slug), theme_versions(name)").eq(/^C-/.test(id) ? "public_id" : "id", id).maybeSingle()).data as (CardRow & { themes: { name: string; slug: string } | null; theme_versions: { name: string } | null }) | null;
  if (!c) return null;
  const [deliveries, timeline, member] = await Promise.all([
    db().from("card_deliveries").select("type, channel, status, error, opened_at, created_at").eq("card_id", c.id).order("created_at"),
    db().from("activity_log").select("occurred_at, event, actor, props").eq("ref_type", "card").eq("ref_id", c.public_id).order("occurred_at"),
    db().from("vault_members").select("id").eq("email", c.sender_email).maybeSingle(),
  ]);
  await track("admin_card_viewed", { card_id: c.public_id }, { email: by, actor: `super_user:${by}`, ref: { type: "card", id: c.public_id } });
  return { card: c, deliveries: deliveries.data ?? [], timeline: timeline.data ?? [], senderMemberId: (member.data as { id: string } | null)?.id ?? null };
}

/** "Delete on request" for one card: its files and row (deliveries cascade); the request is recorded. */
export async function deleteOneCard(id: string, by: string) {
  const c = (await db().from("cards").select("id, public_id, sender_email, jpeg_path, portrait_path").eq("id", id).maybeSingle()).data as { id: string; public_id: string; sender_email: string; jpeg_path: string | null; portrait_path: string | null } | null;
  if (!c) return false;
  const req = (await db().from("data_requests").insert({ email: c.sender_email, type: "delete", requested_by: by, status: "pending", notes: `card ${c.public_id}` }).select("id").single()).data as { id: string };
  if (c.jpeg_path) await removeObjects("cards", [c.jpeg_path]);
  if (c.portrait_path) {
    const others = await db().from("cards").select("id", { count: "exact", head: true }).eq("portrait_path", c.portrait_path).neq("id", c.id);
    if (!others.count) await removeObjects("portraits", [c.portrait_path]);
  }
  await db().from("cards").delete().eq("id", c.id);
  await db().from("data_requests").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", req.id);
  await track("admin_data_deleted", { request_id: req.id, card_id: c.public_id }, { email: by, actor: `super_user:${by}`, ref: { type: "card", id: c.public_id } });
  return true;
}
