import "server-only";
import { z } from "zod";
import { db, must } from "@/lib/db/client";
import { getSettings } from "@/lib/settings";
import { createSigninLink } from "@/lib/auth/links";
import { upsertMember } from "@/lib/db/members";
import { track } from "@/lib/track";
import { getCatalog, pickFirstCardVersion } from "@/lib/db/themes";
import { getSources } from "@/lib/sources";
import { viewOrder } from "@/lib/redeem/service";
import { isInSeason, currentWindow } from "@/lib/themes/season";
import { maskEmail } from "@/lib/utils";
import { env } from "@/lib/env";
import { emailSender } from "@/lib/email";
import { renderEmail } from "@/lib/email/render";
import { emailFooter } from "@/lib/email/footer";
import { giftOfferSubject } from "@/emails/gift-offer";

/** The subset of the orders/paid payload we rely on (docs/data.md §5.6). */
export const orderPaidSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  name: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  contact_email: z.string().optional().nullable(),
  customer: z.object({ email: z.string().optional().nullable() }).partial().optional().nullable(),
  created_at: z.string().optional().nullable(),
  processed_at: z.string().optional().nullable(),
  financial_status: z.string().optional().nullable(),
  cancelled_at: z.string().optional().nullable(),
  test: z.boolean().optional().nullable(),
  line_items: z
    .array(
      z.object({
        product_id: z.union([z.number(), z.string()]).optional().nullable(),
        properties: z.array(z.object({ name: z.string(), value: z.union([z.string(), z.number()]).nullable() })).optional().nullable(),
      }),
    )
    .default([]),
});
export type OrderPaid = z.infer<typeof orderPaidSchema>;

const PAID = new Set(["paid", "partially_paid", "partially_refunded"]);

export function qualifies(o: OrderPaid, rule: "any_paid_order" | "qualifying_products", productIds: string[]): { ok: true } | { ok: false; reason: string } {
  if (o.test) return { ok: false, reason: "test_order" };
  if (o.cancelled_at) return { ok: false, reason: "cancelled" };
  if (!PAID.has((o.financial_status ?? "").toLowerCase())) return { ok: false, reason: `financial_status:${o.financial_status ?? "none"}` };
  if (!emailOf(o)) return { ok: false, reason: "no_email" };
  if (rule === "qualifying_products" && !o.line_items.some((l) => l.product_id != null && productIds.includes(String(l.product_id)))) return { ok: false, reason: "no_qualifying_product" };
  return { ok: true };
}

export function emailOf(o: OrderPaid): string | null {
  const e = (o.email || o.contact_email || o.customer?.email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

function portraitUrlOf(o: OrderPaid, allowedHosts: string[]): string | null {
  for (const l of o.line_items) {
    const url = l.properties?.find((p) => p.name === "_image_url")?.value;
    if (typeof url === "string") {
      try {
        if (allowedHosts.includes(new URL(url).hostname)) return url;
      } catch {
        /* */
      }
    }
  }
  return null;
}

/**
 * orders/paid: one gift_offers row per order. Qualifying orders are `pending` (sent by cron after
 * `gift.offer_email_delay_minutes`); others are recorded `skipped` with the reason. Idempotent on the order id.
 */
export async function recordPaidOrder(o: OrderPaid): Promise<{ created: boolean; status: "pending" | "skipped"; reason?: string }> {
  const s = await getSettings(["gift.unlock_rule", "gift.qualifying_product_ids", "gift.offer_email_delay_minutes", "redeem.allowed_image_hosts"] as const);
  const email = emailOf(o);
  const q = qualifies(o, s["gift.unlock_rule"], s["gift.qualifying_product_ids"]);
  const paidAt = o.processed_at ?? o.created_at ?? new Date().toISOString();
  const row = {
    shopify_order_id: o.id,
    order_name: o.name ?? null,
    email: email ?? "unknown@invalid.local",
    paid_at: paidAt,
    send_after: new Date(new Date(paidAt).getTime() + s["gift.offer_email_delay_minutes"] * 60_000).toISOString(),
    status: q.ok ? "pending" : "skipped",
    skip_reason: q.ok ? null : q.reason,
    portrait_image_url: portraitUrlOf(o, s["redeem.allowed_image_hosts"]),
  };
  const ins = await db().from("gift_offers").insert(row).select("id").maybeSingle();
  if (ins.error?.code === "23505") return { created: false, status: row.status as "pending" | "skipped" };
  if (ins.error) throw new Error(ins.error.message);
  if (email) await upsertMember(email, "gift_offer", {}).catch(() => null);
  if (!q.ok) await track("gift_offer_skipped", { order_id: o.id, reason: q.reason }, { email, source: "shopify", actor: "system", ref: { type: "order", id: o.id } });
  return { created: true, status: row.status as "pending" | "skipped", reason: q.ok ? undefined : q.reason };
}

type OfferRow = { id: string; shopify_order_id: string; order_name: string | null; email: string; paid_at: string | null; portrait_image_url: string | null; status: string };

async function suggestedDesign(now: Date): Promise<string | null> {
  const s = await getSettings(["themes.in_season_days_before", "cards.first_card_default_version"] as const);
  const v = pickFirstCardVersion(await getCatalog(now, s["themes.in_season_days_before"]), s["cards.first_card_default_version"]);
  return v?.fullSlug ?? null;
}

/**
 * Cron: for each due offer, makes a fresh one-tap link and queues `free_gift_unlocked` for Klaviyo
 * (exactly once per order, by dedupe key). This app sends no offer email itself.
 * With `gift.offer_email_enabled` off nothing is sent and due offers are marked skipped.
 */
export async function sendDueOffers(now = new Date()): Promise<{ sent: number; skipped: number }> {
  const s = await getSettings(["gift.offer_email_enabled", "gift.link_valid_days", "gift.offer_email_channel", "gift.offer_email_subject", "email.from_system", "email.reply_to"] as const);
  const due = must(await db().from("gift_offers").select("id, shopify_order_id, order_name, email, paid_at, portrait_image_url, status").eq("status", "pending").lte("send_after", now.toISOString()).limit(200), "due offers") as OfferRow[];
  let sent = 0;
  let skipped = 0;
  const design = due.length ? await suggestedDesign(now) : null;
  for (const o of due) {
    if (!s["gift.offer_email_enabled"]) {
      await db().from("gift_offers").update({ status: "skipped", skip_reason: "offer_email_disabled" }).eq("id", o.id).eq("status", "pending");
      await track("gift_offer_skipped", { order_id: o.shopify_order_id, reason: "offer_email_disabled" }, { email: o.email, source: "shopify", actor: "system", ref: { type: "order", id: o.shopify_order_id } });
      skipped++;
      continue;
    }
    if (s["gift.offer_email_channel"] === "agentmail" && (await isSuppressed(o.email))) {
      await db().from("gift_offers").update({ status: "skipped", skip_reason: "suppressed" }).eq("id", o.id).eq("status", "pending");
      await track("gift_offer_skipped", { order_id: o.shopify_order_id, reason: "suppressed" }, { email: o.email, source: "shopify", actor: "system", ref: { type: "order", id: o.shopify_order_id } });
      skipped++;
      continue;
    }
    const claim = await db().from("gift_offers").update({ status: "sent", sent_at: now.toISOString() }).eq("id", o.id).eq("status", "pending").select("id");
    if (!claim.data?.length) continue;
    const link = await createSigninLink({ email: o.email, purpose: "gift_offer", validDays: s["gift.link_valid_days"], giftOfferId: o.id, orderLegacyId: o.shopify_order_id });
    await db().from("gift_offers").update({ token_hash: link.tokenHash, token_expires_at: link.expiresAt }).eq("id", o.id);
    const firstOrder = ((await db().from("gift_offers").select("id", { count: "exact", head: true }).eq("email", o.email).neq("status", "skipped")).count ?? 1) <= 1;
    await track(
      "free_gift_unlocked",
      { order_id: o.shopify_order_id, order_name: o.order_name, first_order: firstOrder },
      {
        email: o.email,
        source: "shopify",
        actor: "system",
        ref: { type: "order", id: o.shopify_order_id },
        klaviyo: { dedupeKey: `free_gift_unlocked:${o.shopify_order_id}`, extra: { card_link: link.url, link_expires_at: link.expiresAt, portrait_image_url: o.portrait_image_url, suggested_design: design } },
      },
    );
    if (s["gift.offer_email_channel"] === "agentmail") {
      const r = await sendOfferEmail(o, link.url, s);
      if (!r.ok) {
        await db().from("gift_offers").update({ status: "failed", email_status: "failed", email_error: r.error }).eq("id", o.id);
        await track("gift_offer_email_failed", { order_id: o.shopify_order_id, error: r.error }, { email: o.email, source: "shopify", actor: "system", ref: { type: "order", id: o.shopify_order_id } });
        continue;
      }
      await db().from("gift_offers").update({ email_status: "sent", provider_message_id: r.messageId }).eq("id", o.id);
    }
    await track("gift_offer_email_sent", { order_id: o.shopify_order_id, order_name: o.order_name, channel: s["gift.offer_email_channel"] }, { email: o.email, source: "shopify", actor: "system", ref: { type: "order", id: o.shopify_order_id } });
    sent++;
  }
  return { sent, skipped };
}

/** The thank-you pop-up link: a fresh one-tap link for this order's offer (created if the webhook hasn't arrived yet). */
export async function popupLinkFor(orderLegacyId: string, now = new Date()): Promise<{ url: string; expiresAt: string; offerId: string; email: string; orderName: string | null } | { error: "not_found" | "too_old" | "not_eligible" }> {
  const s = await getSettings(["gift.popup_window_minutes", "gift.link_valid_days", "gift.unlock_rule", "gift.qualifying_product_ids"] as const);
  const { shopify } = await getSources();
  const order = await shopify.orderById(orderLegacyId).catch(() => null);
  if (!order || order.test) return { error: "not_found" };
  const paidAt = new Date(order.processedAt ?? order.createdAt).getTime();
  if (now.getTime() - paidAt > s["gift.popup_window_minutes"] * 60_000) return { error: "too_old" };
  const email = (order.email ?? order.customer?.email ?? "").toLowerCase();
  const { orderUnlocksGift } = await import("@/lib/redeem/order");
  if (!email || !orderUnlocksGift(order, s["gift.unlock_rule"], s["gift.qualifying_product_ids"])) return { error: "not_eligible" };
  let offer = (await db().from("gift_offers").select("id").eq("shopify_order_id", order.legacyId).maybeSingle()).data as { id: string } | null;
  if (!offer) {
    const ins = await db()
      .from("gift_offers")
      .insert({ shopify_order_id: order.legacyId, order_name: order.name, email, paid_at: new Date(paidAt).toISOString(), send_after: new Date(paidAt).toISOString(), status: "pending" })
      .select("id")
      .single();
    offer = (ins.data as { id: string } | null) ?? ((await db().from("gift_offers").select("id").eq("shopify_order_id", order.legacyId).single()).data as { id: string });
    await upsertMember(email, "gift_offer", {}).catch(() => null);
  }
  const link = await createSigninLink({ email, purpose: "gift_offer", validDays: s["gift.link_valid_days"], giftOfferId: offer.id, orderLegacyId: order.legacyId, createdBy: "thankyou_popup" });
  await db().from("gift_offers").update({ token_hash: link.tokenHash, token_expires_at: link.expiresAt }).eq("id", offer.id);
  return { url: link.url, expiresAt: link.expiresAt, offerId: offer.id, email, orderName: order.name };
}

/** Seasonal reminder (off by default): `gift_reminder_due` to Klaviyo for customers with the free gift who haven't made a card lately. */
export async function sendSeasonalReminders(now = new Date()): Promise<{ queued: number; categories: string[] }> {
  const s = await getSettings(["gift.reminder_email_enabled", "gift.reminder_days_before", "gift.reminder_skip_if_card_within_days", "gift.link_valid_days", "klaviyo.include_signin_link"] as const);
  if (!s["gift.reminder_email_enabled"]) return { queued: 0, categories: [] };
  const [cats, themes] = await Promise.all([db().from("theme_categories").select("id, slug, name, reminder_enabled"), db().from("themes").select("id, slug, category_id, available_from, available_to, repeats_yearly, status")]);
  const due: { slug: string; name: string; year: number }[] = [];
  for (const c of (cats.data ?? []) as { id: string; slug: string; name: string; reminder_enabled: boolean }[]) {
    if (!c.reminder_enabled) continue;
    for (const t of (themes.data ?? []) as { category_id: string; status: string; available_from: string | null; available_to: string | null; repeats_yearly: boolean }[]) {
      if (t.category_id !== c.id || t.status !== "live") continue;
      const w = currentWindow(t, now);
      if (!w) continue;
      const days = Math.round((w.start - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000);
      if (days === s["gift.reminder_days_before"] && !isInSeason(t, new Date(now.getTime() - 86_400_000), 0)) {
        due.push({ slug: c.slug, name: c.name, year: new Date(w.start).getUTCFullYear() });
        break;
      }
    }
  }
  if (!due.length) return { queued: 0, categories: [] };
  const offers = (await db().from("gift_offers").select("email").neq("status", "skipped").limit(50000)).data as { email: string }[] | null;
  const emails = [...new Set((offers ?? []).map((o) => o.email))];
  const since = new Date(now.getTime() - s["gift.reminder_skip_if_card_within_days"] * 86_400_000).toISOString();
  const recent = new Set(((await db().from("cards").select("sender_email").gte("created_at", since).limit(50000)).data as { sender_email: string }[] | null ?? []).map((c) => c.sender_email));
  const design = await suggestedDesign(now);
  let queued = 0;
  for (const cat of due) {
    for (const email of emails) {
      if (recent.has(email)) continue;
      const link = s["klaviyo.include_signin_link"] ? await createSigninLink({ email, purpose: "gift_reminder", validDays: s["gift.link_valid_days"] }) : null;
      const r = await track(
        "gift_reminder_due",
        { category: cat.slug, version_slug: design },
        { email, actor: "system", klaviyo: { dedupeKey: `gift_reminder_due:${cat.slug}:${cat.year}:${email}`, extra: { category: cat.name, suggested_design: design, card_link: link?.url } } },
      );
      if (r.outboxId) {
        queued++;
        await track("gift_reminder_email_sent", { category: cat.slug, theme_slug: design }, { email, actor: "system" });
      }
    }
  }
  return { queued, categories: due.map((d) => d.slug) };
}

/** Mug photo reminder (off by default): `mug_photo_needed` once per order, N days after the order, while no photo is chosen and the mug isn't locked. */
export async function sendMugReminders(now = new Date()): Promise<{ queued: number; checked: number }> {
  const s = await getSettings(["redeem.mug_reminder_enabled", "redeem.mug_reminder_after_days", "redeem.mug_reminder_max_age_days", "gift.link_valid_days"] as const);
  if (!s["redeem.mug_reminder_enabled"]) return { queued: 0, checked: 0 };
  const olderThan = new Date(now.getTime() - s["redeem.mug_reminder_after_days"] * 86_400_000).toISOString();
  const newerThan = new Date(now.getTime() - s["redeem.mug_reminder_max_age_days"] * 86_400_000).toISOString();
  const rows = (await db().from("gift_offers").select("shopify_order_id, email").lte("paid_at", olderThan).gte("paid_at", newerThan).limit(2000)).data as { shopify_order_id: string; email: string }[] | null;
  const { shopify } = await getSources();
  let queued = 0;
  let checked = 0;
  for (const r of rows ?? []) {
    const already = await db().from("outbound_events").select("id").eq("dedupe_key", `mug_photo_needed:${r.shopify_order_id}`).maybeSingle();
    if (already.data) continue;
    const order = await shopify.orderById(r.shopify_order_id).catch(() => null);
    if (!order) continue;
    checked++;
    const v = await viewOrder(order, now);
    if (!v.parsed.mug.present || v.parsed.mug.currentTileId || v.lock.locked) continue;
    const link = await createSigninLink({ email: r.email, purpose: "mug_reminder", validDays: s["gift.link_valid_days"], redirectPath: `/orders/${order.name.replace(/^#/, "")}`, orderLegacyId: order.legacyId });
    const t = await track(
      "mug_photo_needed",
      { order_id: order.legacyId, order_name: order.name, portrait_count: v.mugPortraits.length },
      { email: r.email, source: "shopify", actor: "system", ref: { type: "order", id: order.legacyId }, klaviyo: { dedupeKey: `mug_photo_needed:${order.legacyId}`, extra: { order_link: link.url } } },
    );
    if (t.outboxId) queued++;
  }
  if (queued) console.info(`[gift] mug reminders queued: ${queued}`);
  return { queued, checked };
}

export { maskEmail };

async function isSuppressed(email: string): Promise<boolean> {
  const r = await db().from("email_suppressions").select("scope").eq("email", email).in("scope", ["offer_emails", "all"]).limit(1);
  return Boolean(r.data?.length);
}

/** The offer email, sent by this app through AgentMail (gift.offer_email_channel = agentmail). */
async function sendOfferEmail(
  o: OfferRow,
  linkUrl: string,
  s: { "gift.link_valid_days": number; "gift.offer_email_subject": string; "email.from_system": string; "email.reply_to": string },
) {
  const base = env.appUrl;
  const member = (await db().from("vault_members").select("display_name").eq("email", o.email).maybeSingle()).data as { display_name: string | null } | null;
  const firstName = member?.display_name?.trim().split(/\s+/)[0] || null;
  const unsubscribeUrl = `${base}/gift/unsubscribe?o=${o.id}`;
  const { html, text } = await renderEmail("gift-offer", {
    appUrl: base,
    firstName,
    orderName: o.order_name,
    linkUrl,
    validDays: s["gift.link_valid_days"],
    unsubscribeUrl,
    footer: await emailFooter(),
  });
  const res = await emailSender().send({
    from: s["email.from_system"],
    to: o.email,
    replyTo: s["email.reply_to"],
    subject: giftOfferSubject(s["gift.offer_email_subject"], o.order_name),
    html,
    text,
    headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
    idempotencyKey: `gift-offer-${o.id}`,
  });
  if (!res.ok) console.error(`[email] gift offer ${o.shopify_order_id} to ${maskEmail(o.email)} failed: ${res.error}`);
  return res;
}

/** "Don't email me offers" (from the offer email footer): looks up the offer by its opaque id. */
export async function offerForUnsubscribe(offerId: string): Promise<{ email: string; orderId: string } | null> {
  if (!/^[0-9a-f-]{36}$/.test(offerId)) return null;
  const r = (await db().from("gift_offers").select("email, shopify_order_id").eq("id", offerId).maybeSingle()).data as { email: string; shopify_order_id: string } | null;
  return r && !r.email.endsWith("@invalid.local") ? { email: r.email, orderId: r.shopify_order_id } : null;
}

export async function unsubscribeFromOffers(offerId: string): Promise<boolean> {
  const o = await offerForUnsubscribe(offerId);
  if (!o) return false;
  await db().from("email_suppressions").upsert({ email: o.email, scope: "offer_emails", reason: "unsubscribe" }, { onConflict: "email,scope", ignoreDuplicates: true });
  await track("gift_offer_skipped", { order_id: o.orderId, reason: "unsubscribed" }, { email: o.email, source: "email", actor: "system", ref: { type: "order", id: o.orderId } });
  return true;
}

export async function giftOfferEmailStats(sinceDays: number) {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const r = await db().rpc("gift_offer_email_stats", { since });
  const row = ((r.data ?? []) as Record<string, number | string>[])[0] ?? {};
  const n = (k: string) => Number(row[k] ?? 0);
  return { sent: n("sent"), delivered: n("delivered"), bounced: n("bounced"), failed: n("failed"), clicked: n("clicked"), cardsMade: n("cards_made") };
}
