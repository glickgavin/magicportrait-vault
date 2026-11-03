import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { db, must } from "@/lib/db/client";
import { getSettings } from "@/lib/settings";
import { getVaultProfile } from "@/lib/vault/profile";
import { getCatalog, getVersionById, type CatalogVersion } from "@/lib/db/themes";
import { countCardsBySender, getCardById, type CardRow } from "@/lib/db/cards";
import { cardAccess, monthStart, type CardAccess } from "./rules";
import { fetchAllowedImage } from "@/lib/images";
import { getObject, loadThemeAsset, putObject } from "@/lib/storage";
import { renderCardJpeg } from "@/lib/render/render";
import { track } from "@/lib/track";
import { emailSchema } from "@/lib/auth/schemas";
import { maskEmail } from "@/lib/utils";

export const ENTRY_POINTS = ["order_email", "thankyou_popup", "reminder_email", "site_menu", "home", "my_cards", "my_portraits", "order_page", "make_another", "use_again"] as const;

const name = z.string().trim().min(1).max(60).regex(/^[^<>{}]*$/);

export const createCardSchema = z
  .object({
    versionId: z.string().uuid(),
    imageId: z.string().regex(/^[0-9a-f-]{36}$/i),
    crop: z.object({ zoom: z.number().min(1).max(4), x: z.number().min(-1).max(1), y: z.number().min(-1).max(1) }).default({ zoom: 1, x: 0, y: 0 }),
    to: name,
    from: name,
    message: z.string().trim().max(1000).default(""),
    delivery: z.enum(["email", "self"]),
    recipientEmail: emailSchema.optional(),
    scheduledFor: z.iso.datetime({ offset: true }).optional().nullable(),
    entryPoint: z.enum(ENTRY_POINTS).optional(),
    flow: z.enum(["first", "full"]).default("full"),
    reusedFrom: z.string().uuid().optional().nullable(),
  })
  .refine((v) => v.delivery !== "email" || Boolean(v.recipientEmail), { message: "recipient_email_required", path: ["recipientEmail"] });

export type CreateCardInput = z.infer<typeof createCardSchema>;

export class CardError extends Error {
  constructor(
    public code: "paused" | "locked" | "limit" | "no_portraits" | "bad_version" | "bad_portrait" | "too_long" | "bad_schedule" | "render_failed" | "suppressed",
    public status = 400,
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

function base36(n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += "0123456789abcdefghijklmnopqrstuvwxyz"[randomInt(36)];
  return s;
}
export function newPublicId() {
  return `C-${base36(6)}`;
}
export function newShareSlug() {
  return randomBytes(16).toString("base64url"); // 22 chars
}

export async function accessFor(email: string, profileHasGift: boolean, portraitCount: number, now = new Date()): Promise<CardAccess> {
  const s = await getSettings(["cards.enabled", "cards.who_can_create", "cards.per_customer"] as const);
  return cardAccess({
    enabled: s["cards.enabled"],
    whoCanCreate: s["cards.who_can_create"],
    perCustomer: s["cards.per_customer"],
    hasFreeGift: profileHasGift,
    portraitCount,
    cardsThisMonth: s["cards.per_customer"] === "unlimited" ? 0 : await countCardsBySender(email, monthStart(now)),
    now,
  });
}

const emailHash = (e: string) => createHash("sha256").update(e).digest("hex").slice(0, 20);

/** Copies the chosen portrait into our storage (as a normalised JPEG) so old cards never break. */
export async function copyPortrait(email: string, imageId: string, imageUrl: string, allowedHosts: string[]): Promise<string> {
  const key = `${emailHash(email)}/${imageId}.jpg`;
  if (await getObject("portraits", key)) return key;
  const { body } = await fetchAllowedImage(imageUrl, allowedHosts);
  const jpeg = await sharp(body).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
  await putObject("portraits", key, jpeg, "image/jpeg");
  return key;
}

/**
 * Creates a card: re-checks the rules and ownership on the server, copies the portrait,
 * inserts the row (status "rendering"). Rendering is a separate step (renderCard), so the
 * Creating screen can show progress and "Try again".
 */
export async function createCard(email: string, raw: unknown): Promise<{ card: CardRow; version: CatalogVersion; firstCard: boolean }> {
  const input = createCardSchema.parse(raw);
  const now = new Date();
  const s = await getSettings(["cards.message_max_chars", "themes.in_season_days_before", "redeem.allowed_image_hosts", "cards.schedule_max_days"] as const);
  const profile = await getVaultProfile(email);

  const access = await accessFor(email, profile.hasFreeGift, profile.portraitCount, now);
  if (!access.allowed) throw new CardError(access.reason, access.reason === "paused" ? 403 : access.reason === "limit" ? 429 : 403, access.reason === "limit" ? { nextAvailableAt: access.nextAvailableAt } : {});

  // The version must be live and on sale today (from the same catalog customers see).
  const catalog = await getCatalog(now, s["themes.in_season_days_before"]);
  const version = catalog.versions.find((v) => v.id === input.versionId);
  if (!version) throw new CardError("bad_version");

  // The portrait must be one of the signed-in person's own portraits.
  const session = profile.sessions.find((g) => g.portraits.some((p) => p.imageId === input.imageId));
  const portrait = session?.portraits.find((p) => p.imageId === input.imageId);
  if (!session || !portrait) throw new CardError("bad_portrait", 404);

  const max = version.messageMaxChars ?? s["cards.message_max_chars"];
  if (input.message.length > max) throw new CardError("too_long", 400, { max });

  let scheduledFor: string | null = null;
  if (input.delivery === "email" && input.scheduledFor) {
    const at = new Date(input.scheduledFor);
    if (at.getTime() < now.getTime() + 60_000 || at.getTime() > now.getTime() + s["cards.schedule_max_days"] * 86_400_000) throw new CardError("bad_schedule");
    scheduledFor = at.toISOString();
  }

  const recipient = input.delivery === "email" ? input.recipientEmail!.toLowerCase() : null;
  if (recipient) {
    const sup = await db().from("email_suppressions").select("email").eq("email", recipient).limit(1);
    if (sup.data?.length) throw new CardError("suppressed", 409);
  }

  const portraitPath = await copyPortrait(email, portrait.imageId, portrait.imageUrl, s["redeem.allowed_image_hosts"]);
  const existing = await countCardsBySender(email);
  const offer = (await db().from("gift_offers").select("id").eq("email", email).order("created_at", { ascending: false }).limit(1)).data?.[0] as { id: string } | undefined;

  let card: CardRow | null = null;
  for (let attempt = 0; attempt < 4 && !card; attempt++) {
    const res = await db()
      .from("cards")
      .insert({
        public_id: newPublicId(),
        share_slug: newShareSlug(),
        sender_email: email,
        from_name: input.from,
        to_name: input.to,
        recipient_email: recipient,
        message: input.message,
        theme_id: version.themeId,
        version_id: version.id,
        imagen_session_id: session.sessionId,
        imagen_image_id: portrait.imageId,
        portrait_path: portraitPath,
        crop: input.crop,
        delivery: input.delivery,
        scheduled_for: scheduledFor,
        status: "rendering",
        entry_point: input.entryPoint ?? null,
        flow: input.flow,
        gift_offer_id: offer?.id ?? null,
        reused_from: input.reusedFrom ?? null,
      })
      .select("*")
      .single();
    if (res.error && res.error.code !== "23505") throw new Error(res.error.message);
    card = res.data as CardRow | null;
  }
  if (!card) throw new Error("could not allocate card ids");
  return { card, version, firstCard: existing === 0 };
}

/** Renders a card's JPEG and moves it on: ready (self), ready + queued email (email now) or scheduled. */
export async function renderCard(cardId: string, opts: { firstCard?: boolean; isRetry?: boolean } = {}): Promise<CardRow> {
  const card = await getCardById(cardId);
  if (!card) throw new Error("card not found");
  const version = card.version_id ? await getVersionById(card.version_id) : null;
  const s = await getSettings(["cards.jpeg_quality", "cards.footer_text", "cards.size_px"] as const);
  try {
    if (!version) throw new Error("version missing");
    const versionRow = (await db().from("theme_versions").select("background_path, overlay_path").eq("id", version.id).single()).data as { background_path: string; overlay_path: string | null };
    const [background, overlay, portrait] = await Promise.all([
      loadThemeAsset(versionRow.background_path),
      loadThemeAsset(versionRow.overlay_path),
      card.portrait_path ? getObject("portraits", card.portrait_path) : Promise.resolve(null),
    ]);
    if (!background) throw new Error("background missing");
    const { jpeg, ms } = await renderCardJpeg({
      layout: version.layout,
      background,
      overlay,
      portrait,
      photoBg: version.photoBg,
      crop: card.crop ?? undefined,
      to: card.to_name,
      from: card.from_name,
      message: card.message,
      footerText: s["cards.footer_text"],
      size: s["cards.size_px"],
      quality: s["cards.jpeg_quality"],
    });
    const key = `${card.id}.jpg`;
    await putObject("cards", key, jpeg, "image/jpeg");
    const status = card.delivery === "email" && card.scheduled_for ? "scheduled" : "ready";
    const updated = must(await db().from("cards").update({ jpeg_path: key, render_ms: ms, status, last_error: null }).eq("id", card.id).select("*").single(), "card rendered") as CardRow;
    if (card.delivery === "email" && !card.scheduled_for) {
      await db().from("card_deliveries").insert({ card_id: card.id, type: "email", status: "queued" });
    }
    await track("card_render_completed", { card_id: card.public_id, render_ms: ms }, { email: card.sender_email, ref: { type: "card", id: card.public_id } });
    if (!opts.isRetry || card.status === "failed") {
      const total = await countCardsBySender(card.sender_email);
      await track(
        "card_created",
        {
          card_id: card.public_id,
          theme_slug: version.fullSlug,
          theme_name: version.themeName,
          category: version.categoryName,
          delivery: card.delivery,
          scheduled: Boolean(card.scheduled_for),
          flow: card.flow ?? "full",
          first_card: opts.firstCard ?? total <= 1,
          cards_created_total: total,
          entry_point: card.entry_point,
        },
        { email: card.sender_email, ref: { type: "card", id: card.public_id } },
      );
    }
    return updated;
  } catch (e) {
    const reason = (e as Error).message.slice(0, 200);
    console.error(`[cards] render failed for ${card.public_id} (${maskEmail(card.sender_email)}): ${reason}`);
    await db().from("cards").update({ status: "failed", last_error: reason }).eq("id", card.id);
    await track("error_card_render_failed", { card_id: card.public_id, reason: reason.slice(0, 80) }, { email: card.sender_email, ref: { type: "card", id: card.public_id } });
    throw new CardError("render_failed", 500);
  }
}
