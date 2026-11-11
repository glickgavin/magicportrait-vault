import "server-only";
import { createHash } from "node:crypto";
import { db, must } from "@/lib/db/client";
import { getMember, searchMembers, type MemberRow } from "@/lib/db/members";
import { getVaultProfile } from "@/lib/vault/profile";
import { listCardsBySender } from "@/lib/db/cards";
import { removeObjects, signedUrl } from "@/lib/storage";
import { queueDeletion } from "@/lib/klaviyo";
import { track } from "@/lib/track";
import { emailSchema } from "@/lib/auth/schemas";
import { deleteShopRows } from "@/lib/db/shop";

export const emailHash = (e: string) => createHash("sha256").update(e.toLowerCase()).digest("hex").slice(0, 16);

/**
 * Super-user search. A full email that we don't know yet is looked up live, and if Shopify or Imagen
 * know the person, their row is created with created_via = 'admin_lookup'.
 */
export async function searchCustomers(q: string): Promise<MemberRow[]> {
  const found = await searchMembers(q);
  const asEmail = emailSchema.safeParse(q);
  if (!found.length && asEmail.success) {
    const p = await getVaultProfile(asEmail.data, { refresh: true, createdVia: "admin_lookup" });
    if (p.state === "nobody") await db().from("vault_members").delete().eq("email", asEmail.data).eq("created_via", "admin_lookup").is("first_signed_in_at", null);
    const m = await getMember(asEmail.data);
    return m ? [m] : [];
  }
  return found;
}

export type TimelineItem = { at: string; source: "vault" | "email" | "shopify" | "imagen"; title: string; detail?: string; ref?: string };

/** One timeline merged by time: activity_log (My MP, Email) + live Shopify orders + live Imagen sessions. */
export async function customerTimeline(email: string): Promise<{ items: TimelineItem[]; profile: Awaited<ReturnType<typeof getVaultProfile>> }> {
  const [profile, act] = await Promise.all([
    getVaultProfile(email, { createdVia: "admin_lookup" }),
    db().from("activity_log").select("occurred_at, event, source, ref_type, ref_id, props").eq("email", email).order("occurred_at", { ascending: false }).limit(300),
  ]);
  const items: TimelineItem[] = [];
  for (const a of (act.data ?? []) as { occurred_at: string; event: string; source: string; ref_type: string | null; ref_id: string | null; props: Record<string, unknown> }[]) {
    const src = a.source === "email" || a.event.startsWith("card_email") || a.event.includes("recipient_email") ? "email" : a.source === "shopify" ? "shopify" : "vault";
    items.push({ at: a.occurred_at, source: src as TimelineItem["source"], title: a.event.replace(/_/g, " "), detail: Object.entries(a.props ?? {}).map(([k, v]) => `${k}: ${String(v)}`).join(" · ").slice(0, 160), ref: a.ref_id ?? undefined });
  }
  for (const o of profile.rawOrders) items.push({ at: o.createdAt, source: "shopify", title: `Order ${o.name}`, detail: `${o.financialStatus ?? ""} · ${o.fulfillmentStatus ?? ""}${o.cancelledAt ? " · cancelled" : ""}${o.total ? ` · ${o.total.amount} ${o.total.currency}` : ""}`, ref: o.legacyId });
  for (const s of profile.sessions) items.push({ at: s.createdAt, source: "imagen", title: `Portrait session · ${s.themeName ?? "portraits"}`, detail: `${s.petName ? `${s.petName} · ` : ""}${s.portraits.length} portraits${s.ordered ? " · ordered" : ""}`, ref: s.sessionId });
  for (const i of items) i.at = new Date(i.at).toISOString();
  items.sort((a, b) => b.at.localeCompare(a.at));
  return { items, profile };
}

/** Export: the person's cards (with short-lived image links), activity rows and settings changes they made. */
export async function exportCustomer(email: string, by: string) {
  const req = must(await db().from("data_requests").insert({ email, type: "export", requested_by: by, status: "pending" }).select("id").single(), "request") as { id: string };
  const cards = await listCardsBySender(email, 10000);
  const out = {
    email,
    exported_at: new Date().toISOString(),
    cards: await Promise.all(
      cards.map(async (c) => ({
        id: c.public_id,
        created_at: c.created_at,
        to: c.to_name,
        from: c.from_name,
        recipient_email: c.recipient_email,
        message: c.message,
        delivery: c.delivery,
        status: c.status,
        scheduled_for: c.scheduled_for,
        image_url: c.jpeg_path ? await signedUrl("cards", c.jpeg_path, 7 * 86400) : null,
      })),
    ),
    activity: (await db().from("activity_log").select("occurred_at, event, source, ref_type, ref_id, props").eq("email", email).order("occurred_at").limit(10000)).data ?? [],
    settings_changes: (await db().from("settings_history").select("key, old_value, new_value, changed_at").eq("changed_by", email).limit(10000)).data ?? [],
  };
  await db().from("data_requests").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", req.id);
  await track("admin_data_exported", { request_id: req.id }, { email: by, actor: `super_user:${by}`, ref: { type: "request", id: req.id } });
  return out;
}

/**
 * Delete on request (SPEC §15): removes their cards and the card and portrait files, anonymises
 * their activity rows, deletes their outbox rows, asks Klaviyo to delete the profile, blocks future
 * card emails to them, and records the request. Shopify and Imagen are not touched.
 */
export async function deleteCustomer(email: string, by: string): Promise<{ requestId: string; cards: number; anonymised: number }> {
  const e = email.toLowerCase();
  const req = must(await db().from("data_requests").insert({ email: e, type: "delete", requested_by: by, status: "pending" }).select("id").single(), "request") as { id: string };
  const cards = await listCardsBySender(e, 100000);
  await removeObjects("cards", cards.map((c) => c.jpeg_path).filter(Boolean) as string[]);
  const portraitKeys = [...new Set(cards.map((c) => c.portrait_path).filter(Boolean) as string[])];
  const prefix = createHash("sha256").update(e).digest("hex").slice(0, 20);
  const listed = (await db().storage.from("portraits").list(prefix, { limit: 1000 })).data ?? [];
  await removeObjects("portraits", [...new Set([...portraitKeys, ...listed.map((f) => `${prefix}/${f.name}`)])]);
  if (cards.length) await db().from("cards").delete().in("id", cards.map((c) => c.id));
  // The shop (docs/shop.md): carts, cart lines, remembered pictures and new uploads.
  const shop = await deleteShopRows(e);
  await removeObjects("shop-uploads", shop.uploadPaths);
  const anon = (await db().rpc("anonymise_activity", { p_email: e })).data as number;
  await db().from("outbound_events").delete().eq("email", e);
  await queueDeletion(e);
  await db().from("email_suppressions").upsert({ email: e, scope: "all", reason: "deletion" }, { onConflict: "email,scope" });
  await db().from("signin_links").delete().eq("email", e);
  await db().from("gift_offers").update({ email: `deleted-${emailHash(e)}@invalid.local` }).eq("email", e);
  await db().from("vault_members").delete().eq("email", e);
  await db().from("data_requests").update({ status: "done", completed_at: new Date().toISOString(), notes: `cards=${cards.length} activity=${anon} shop_images=${shop.images} shop_carts=${shop.carts}` }).eq("id", req.id);
  await track("admin_data_deleted", { request_id: req.id, cards: cards.length }, { email: by, actor: `super_user:${by}`, ref: { type: "request", id: req.id } });
  return { requestId: req.id, cards: cards.length, anonymised: anon ?? 0 };
}
