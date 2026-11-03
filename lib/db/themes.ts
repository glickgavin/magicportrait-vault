import "server-only";
import { db, must } from "@/lib/db/client";
import { parseLayout, type Layout } from "@/lib/render/layout";
import { themeAssetUrl } from "@/lib/render/assets";
import { isAvailable, isInSeason } from "@/lib/themes/season";

export type Category = { id: string; slug: string; name: string; sort_order: number; reminder_enabled: boolean };
export type ThemeRow = { id: string; slug: string; name: string; category_id: string; available_from: string | null; available_to: string | null; repeats_yearly: boolean; sort_order: number; status: string };
export type VersionRow = {
  id: string;
  theme_id: string;
  slug: string;
  name: string;
  status: "draft" | "live" | "archived";
  is_new: boolean;
  sort_order: number;
  background_path: string;
  overlay_path: string | null;
  thumbnail_path: string | null;
  layout: unknown;
  message_ideas: string[];
  message_max_chars: number | null;
  published_at: string | null;
};

export type CatalogVersion = {
  id: string;
  themeId: string;
  fullSlug: string;
  themeSlug: string;
  versionSlug: string;
  themeName: string;
  name: string;
  categorySlug: string;
  categoryName: string;
  isNew: boolean;
  inSeason: boolean;
  layout: Layout;
  backgroundUrl: string;
  overlayUrl: string | null;
  thumbnailUrl: string | null;
  messageIdeas: string[];
  messageMaxChars: number | null;
  photoBg: string;
};

export type Catalog = { categories: (Category & { inSeason: boolean; versions: CatalogVersion[] })[]; versions: CatalogVersion[] };

export async function loadThemeTables() {
  const [c, t, v] = await Promise.all([
    db().from("theme_categories").select("*").order("sort_order"),
    db().from("themes").select("*").order("sort_order"),
    db().from("theme_versions").select("*").order("sort_order"),
  ]);
  return { categories: must(c, "categories") as Category[], themes: must(t, "themes") as ThemeRow[], versions: must(v, "versions") as VersionRow[] };
}

function photoBgFor(layout: Layout): string {
  // A soft tint from the text colour, used behind the portrait while it loads.
  return layout.text.message.color.toLowerCase() === "#fff8ec" || layout.text.message.color.toLowerCase() === "#f5f1e6" ? "#2F3A5A" : "#E8E2D8";
}

export function toCatalogVersion(v: VersionRow, t: ThemeRow, c: Category, inSeason: boolean): CatalogVersion {
  const layout = parseLayout(v.layout);
  return {
    id: v.id,
    themeId: t.id,
    fullSlug: `${t.slug}-${v.slug}`,
    themeSlug: t.slug,
    versionSlug: v.slug,
    themeName: t.name,
    name: v.name,
    categorySlug: c.slug,
    categoryName: c.name,
    isNew: v.is_new,
    inSeason,
    layout,
    backgroundUrl: themeAssetUrl(v.background_path)!,
    overlayUrl: themeAssetUrl(v.overlay_path),
    thumbnailUrl: themeAssetUrl(v.thumbnail_path),
    messageIdeas: v.message_ideas ?? [],
    messageMaxChars: v.message_max_chars,
    photoBg: photoBgFor(layout),
  };
}

/**
 * What customers can pick: live versions of live themes inside their date window.
 * In-season categories sort first.
 */
export async function getCatalog(now: Date, inSeasonDaysBefore: number): Promise<Catalog> {
  const { categories, themes, versions } = await loadThemeTables();
  const out: Catalog["categories"] = categories.map((c) => ({ ...c, inSeason: false, versions: [] }));
  const all: CatalogVersion[] = [];
  for (const t of themes) {
    if (t.status !== "live" || !isAvailable(t, now)) continue;
    const cat = out.find((c) => c.id === t.category_id);
    if (!cat) continue;
    const season = isInSeason(t, now, inSeasonDaysBefore);
    for (const v of versions.filter((x) => x.theme_id === t.id && x.status === "live")) {
      const cv = toCatalogVersion(v, t, cat, season);
      cat.versions.push(cv);
      all.push(cv);
    }
  }
  // A category is in season when one of its live themes is in season (including ones not yet available).
  for (const cat of out) cat.inSeason = themes.some((t) => t.status === "live" && t.category_id === cat.id && isInSeason(t, now, inSeasonDaysBefore));
  const categoriesSorted = out.filter((c) => c.versions.length).sort((a, b) => Number(b.inSeason) - Number(a.inSeason) || a.sort_order - b.sort_order);
  const order = new Map(categoriesSorted.map((c, i) => [c.slug, i]));
  all.sort((a, b) => (order.get(a.categorySlug) ?? 99) - (order.get(b.categorySlug) ?? 99) || Number(b.inSeason) - Number(a.inSeason));
  return { categories: categoriesSorted, versions: all };
}

/** Any version by id (for rendering and admin), regardless of status. */
export async function getVersionById(id: string): Promise<CatalogVersion | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const v = (await db().from("theme_versions").select("*").eq("id", id).maybeSingle()).data as VersionRow | null;
  if (!v) return null;
  const t = (await db().from("themes").select("*").eq("id", v.theme_id).single()).data as ThemeRow;
  const c = (await db().from("theme_categories").select("*").eq("id", t.category_id).single()).data as Category;
  return toCatalogVersion(v, t, c, false);
}

/** First card design (SPEC §8.0): the first in-season live version, else the configured default, else the first live one. */
export function pickFirstCardVersion(catalog: Catalog, defaultFullSlug: string): CatalogVersion | null {
  return catalog.versions.find((v) => v.inSeason) ?? catalog.versions.find((v) => v.fullSlug === defaultFullSlug) ?? catalog.versions[0] ?? null;
}
