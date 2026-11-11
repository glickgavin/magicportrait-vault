import "server-only";
import { db, must } from "@/lib/db/client";
import { getSettings } from "@/lib/settings";
import { getVaultProfile } from "@/lib/vault/profile";
import { getCatalog } from "@/lib/db/themes";
import { getOwnedCard, type CardRow } from "@/lib/db/cards";
import { CardError, copyPortrait, createCardSchema } from "./create";
import { isSuppressed } from "./send";
import { track } from "@/lib/track";

/**
 * "Change" on a scheduled card: new content and/or time. The card goes back to "rendering"; the
 * Creating screen re-renders it and it is scheduled again (or sent now).
 */
export async function editScheduledCard(email: string, cardId: string, raw: unknown): Promise<CardRow> {
  const card = await getOwnedCard(email, cardId);
  if (!card) throw new CardError("bad_version", 404);
  if (card.status !== "scheduled" || !card.scheduled_for || new Date(card.scheduled_for).getTime() <= Date.now() + 60_000) throw new CardError("bad_schedule", 409);
  const input = createCardSchema.parse(raw);
  const s = await getSettings(["cards.message_max_chars", "themes.in_season_days_before", "redeem.allowed_image_hosts", "cards.schedule_max_days"] as const);
  const now = new Date();
  const catalog = await getCatalog(now, s["themes.in_season_days_before"]);
  const version = catalog.versions.find((v) => v.id === input.versionId) ?? (input.versionId === card.version_id ? { id: card.version_id, themeId: card.theme_id, messageMaxChars: null } : null);
  if (!version) throw new CardError("bad_version");
  if (input.message.length > (version.messageMaxChars ?? s["cards.message_max_chars"])) throw new CardError("too_long");
  let profile = await getVaultProfile(email);
  // A portrait from an older session (Show more) isn't in the newest ones: look through them all.
  if (!profile.sessions.some((g) => g.portraits.some((p) => p.imageId === input.imageId)) && profile.more.sessions > 0) profile = await getVaultProfile(email, { all: true });
  const session = profile.sessions.find((g) => g.portraits.some((p) => p.imageId === input.imageId));
  const portrait = session?.portraits.find((p) => p.imageId === input.imageId);
  if (!session || !portrait) throw new CardError("bad_portrait", 404);
  if (input.delivery !== "email" || !input.recipientEmail) throw new CardError("bad_schedule");
  if (await isSuppressed(input.recipientEmail)) throw new CardError("suppressed", 409);
  let scheduledFor: string | null = null;
  if (input.scheduledFor) {
    const at = new Date(input.scheduledFor);
    if (at.getTime() < now.getTime() + 60_000 || at.getTime() > now.getTime() + s["cards.schedule_max_days"] * 86_400_000) throw new CardError("bad_schedule");
    scheduledFor = at.toISOString();
  }
  const portraitPath = portrait.imageId === card.imagen_image_id ? card.portrait_path : await copyPortrait(email, portrait.imageId, portrait.imageUrl, s["redeem.allowed_image_hosts"]);
  const contentChanged =
    input.to !== card.to_name || input.from !== card.from_name || input.message !== card.message || input.versionId !== card.version_id || input.imageId !== card.imagen_image_id || input.recipientEmail !== card.recipient_email || JSON.stringify(input.crop) !== JSON.stringify(card.crop);
  const timeChanged = scheduledFor !== card.scheduled_for;
  const updated = must(
    await db()
      .from("cards")
      .update({
        to_name: input.to,
        from_name: input.from,
        message: input.message,
        recipient_email: input.recipientEmail.toLowerCase(),
        version_id: version.id,
        theme_id: version.themeId,
        imagen_session_id: session.sessionId,
        imagen_image_id: portrait.imageId,
        portrait_path: portraitPath,
        crop: input.crop,
        scheduled_for: scheduledFor,
        status: "rendering",
      })
      .eq("id", card.id)
      .eq("status", "scheduled")
      .select("*")
      .single(),
    "edit card",
  ) as CardRow;
  await track("card_schedule_changed", { card_id: card.public_id, changed: contentChanged ? "content" : timeChanged ? "time" : "content" }, { email, ref: { type: "card", id: card.public_id } });
  return updated;
}
