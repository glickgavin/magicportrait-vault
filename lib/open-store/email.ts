import "server-only";
import { createSigninLink } from "@/lib/auth/links";
import { dayIn, startOfDayIn } from "@/lib/biztime";
import { claimPictureEmail, generationById, picturesEmailedTo, requestPictureEmail, setEmailGiven, type StoreGenerationRow } from "@/lib/db/store";
import { env } from "@/lib/env";
import { emailSender } from "@/lib/email";
import { emailFooter } from "@/lib/email/footer";
import { renderEmail } from "@/lib/email/render";
import { getSettings } from "@/lib/settings";
import { track } from "@/lib/track";
import { getStoreCatalog } from "./index";

/**
 * "While we paint: want Teddy's picture by email?" (docs/open-store.md › Asking for their email while we paint).
 * The address isn't proven, so it never links the visitor to that email's account; only the email's link does.
 */

const legacy = (gid: string) => gid.split("/").pop() ?? gid;
const asVisitor = (visitorId: string) => ({ distinctId: `store:${visitorId}`, source: "vault" as const, actor: "customer" as const });

/** Saves the address on the visitor and the picture; sends at once when the picture is already ready. */
export async function askForPictureEmail(gen: StoreGenerationRow, email: string, consent: boolean): Promise<{ ok: true; sent: boolean } | { ok: false; error: "already_asked" }> {
  await setEmailGiven(gen.visitor_id, email, consent);
  if (!(await requestPictureEmail(gen.id, email, consent))) return { ok: false, error: "already_asked" };
  await track("store_email_given", { product_id: legacy(gen.product_id), marketing_consent: consent, store_visitor_id: gen.visitor_id }, asVisitor(gen.visitor_id));
  const sent = gen.status === "done" ? await sendPictureEmail(gen.id) : false;
  return { ok: true, sent };
}

/**
 * Sends the picture's one email if it was asked for and the picture is ready (called when it becomes ready and
 * when the address is given). The per-address daily limit is checked first; the claim stops a second send.
 */
export async function sendPictureEmail(generationId: string): Promise<boolean> {
  const gen = await generationById(generationId);
  if (!gen || gen.status !== "done" || !gen.email_to || gen.emailed_at) return false;
  const s = await getSettings(["open_store.emails_per_address_per_day", "open_store.email_link_days", "open_store.picture_email_subject", "email.from_system", "email.reply_to", "brand.timezone"] as const);
  const tz = s["brand.timezone"];
  if ((await picturesEmailedTo(gen.email_to, startOfDayIn(tz, dayIn(tz, new Date())))) >= s["open_store.emails_per_address_per_day"]) return false;
  const claim = await claimPictureEmail(gen.id);
  if (!claim) return false;
  const img = gen.images[gen.chosen_index] ?? gen.images[0];
  const entry = (await getStoreCatalog()).entries.find((e) => e.product.id === gen.product_id);
  if (!img || !entry) return false;
  const path = `/store/product/${entry.product.legacyId}?g=${gen.id}&from=email_link`;
  const link = await createSigninLink({ email: claim.email_to, purpose: "store_picture", validDays: s["open_store.email_link_days"], redirectPath: path, createdBy: "open_store" });
  const name = gen.names[0]?.trim() || null;
  const mail = await renderEmail("store-picture", { appUrl: env.appUrl, link: link.url, days: s["open_store.email_link_days"], name, productTitle: entry.product.title, pictureUrl: img.url.startsWith("fixture://") ? `${env.appUrl}/shop-samples/scenes/${img.url.slice(10).split("?")[0]}` : img.url, subjectTemplate: s["open_store.picture_email_subject"], footer: await emailFooter() });
  const r = await emailSender().send({ from: s["email.from_system"], to: claim.email_to, replyTo: s["email.reply_to"], idempotencyKey: `store-picture-${gen.id}`, ...mail });
  if (!r.ok) {
    console.error(`[open-store] picture email failed: ${r.error}`);
    return false;
  }
  await track("store_picture_emailed", { product_id: entry.product.legacyId, theme_slug: gen.theme, store_visitor_id: gen.visitor_id }, asVisitor(gen.visitor_id));
  if (claim.email_consent) {
    const { queueStoreSubscription } = await import("@/lib/klaviyo");
    await queueStoreSubscription(claim.email_to, { productTitle: entry.product.title, themeSlug: gen.theme, productUrl: `${env.appUrl}/store/product/${entry.product.legacyId}` }, gen.id);
  }
  return true;
}

/** The generation a "Your picture is ready" link points at, from its redirect path. */
export function generationIdFromPath(path: string): string | null {
  return /[?&]g=([0-9a-f-]{36})(&|$)/.exec(path)?.[1] ?? null;
}

/** The email's link was used: the email is proven now, so that picture's visitor is linked to it. */
export async function pictureLinkOpened(email: string, redirectPath: string, expired: boolean): Promise<void> {
  const id = generationIdFromPath(redirectPath);
  const gen = id ? await generationById(id) : null;
  await track("store_email_link_opened", { product_id: gen ? legacy(gen.product_id) : null, expired }, { email, source: "vault", actor: "customer" });
  if (expired || !gen || gen.email_to !== email.trim().toLowerCase()) return;
  const { linkVisitorEmail } = await import("@/lib/db/store");
  if (await linkVisitorEmail(gen.visitor_id, email, "email_link")) await track("store_visitor_linked", { via: "email_link", visitors_linked: 1, store_visitor_id: gen.visitor_id }, { email, source: "vault", actor: "customer" });
}
