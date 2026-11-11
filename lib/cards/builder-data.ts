import "server-only";
import { getSettings } from "@/lib/settings";
import { getVaultProfile } from "@/lib/vault/profile";
import { getCatalog, pickFirstCardVersion } from "@/lib/db/themes";
import { countCardsBySender } from "@/lib/db/cards";
import { pickFirstCardPortrait } from "@/lib/vault/profile-core";
import { accessFor, ENTRY_POINTS } from "./create";
import type { CardAccess } from "./rules";
import type { BuilderData, ClientSession } from "@/components/builder/types";
import type { SessionGroup } from "@/lib/vault/profile-core";

export type BuilderLoad = { data: BuilderData; access: CardAccess; firstCardMode: "one_screen" | "full_builder" };

/** Everything the builder screens need, for the signed-in person only (no emails, no other people). */
export async function loadBuilder(email: string, opts: { imageId?: string | null } = {}): Promise<BuilderLoad> {
  const now = new Date();
  const s = await getSettings(["themes.in_season_days_before", "cards.first_card_default_version", "cards.footer_text", "cards.message_max_chars", "cards.schedule_max_days", "cards.first_card_mode", "cards.scheduling_enabled"] as const);
  const [recent, catalog, cardsCount] = await Promise.all([getVaultProfile(email), getCatalog(now, s["themes.in_season_days_before"]), countCardsBySender(email)]);
  let profile = recent;
  // A portrait asked for by link may be in an older session than the newest ones shown first.
  if (opts.imageId && profile.more.sessions > 0 && !profile.sessions.some((g) => g.portraits.some((p) => p.imageId === opts.imageId))) profile = await getVaultProfile(email, { all: true });
  const access = await accessFor(email, profile.hasFreeGift, profile.portraitCount, now);
  const first = pickFirstCardVersion(catalog, s["cards.first_card_default_version"]);
  const pick = pickFirstCardPortrait(profile);
  const requested = opts.imageId && profile.sessions.some((g) => g.portraits.some((p) => p.imageId === opts.imageId)) ? opts.imageId : null;
  const data: BuilderData = {
    versions: catalog.versions.map((v) => ({
      id: v.id,
      fullSlug: v.fullSlug,
      versionSlug: v.versionSlug,
      themeName: v.themeName,
      name: v.name,
      categorySlug: v.categorySlug,
      categoryName: v.categoryName,
      isNew: v.isNew,
      inSeason: v.inSeason,
      layout: v.layout,
      backgroundUrl: v.backgroundUrl,
      overlayUrl: v.overlayUrl,
      thumbnailUrl: v.thumbnailUrl,
      messageIdeas: v.messageIdeas,
      messageMaxChars: v.messageMaxChars,
      photoBg: v.photoBg,
    })),
    categories: catalog.categories.map((c) => ({ slug: c.slug, name: c.name, inSeason: c.inSeason, count: c.versions.length })),
    sessions: clientSessions(profile.sessions),
    moreSessions: profile.more.sessions,
    firstName: profile.firstName ?? "",
    footerText: s["cards.footer_text"],
    maxChars: s["cards.message_max_chars"],
    scheduleMaxDays: s["cards.schedule_max_days"],
    schedulingEnabled: s["cards.scheduling_enabled"],
    cardsCount,
    defaults: { versionId: first?.id ?? null, imageId: requested ?? pick?.portrait.imageId ?? null },
  };
  return { data, access, firstCardMode: s["cards.first_card_mode"] };
}

/** Sessions as the builder's pickers get them (no order details). */
export function clientSessions(sessions: SessionGroup[]): ClientSession[] {
  return sessions.map((g) => ({
    sessionId: g.sessionId,
    themeName: g.themeName,
    petName: g.petName,
    createdAt: g.createdAt,
    portraits: g.portraits.map((p) => ({ imageId: p.imageId, imageUrl: p.imageUrl, ordered: p.ordered, sessionId: g.sessionId, width: p.width, height: p.height })),
  }));
}

export function cleanEntryPoint(v: string | undefined | null): string | null {
  return v && (ENTRY_POINTS as readonly string[]).includes(v) ? v : null;
}
