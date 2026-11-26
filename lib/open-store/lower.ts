/**
 * Pure: the product page's trust card and lower sections (docs/open-store.md › Product page, items 9 and 12 to 18).
 * The words, numbers and photos live in settings (lib/settings/registry.ts); this file holds their shapes and the
 * small rules for showing them. Safe to import in the browser.
 */

export const GUARANTEE_ICONS = ["shield", "sparkles", "heart", "lock", "truck", "gift", "star", "clock"] as const;
export const QUALITY_ICONS = ["check", "sticker", "move", "shield", "flag", "sparkles", "heart", "star", "frame", "ruler", "sun", "droplet", "gift", "clock", "truck"] as const;

export type TrustStat = { value: string; label: string };
export type TrustpilotSetting = { score: number | null; label: string; count: number | null; url: string };
export type HowStep = { title: string; body: string; image: string; alt: string };
export type StoreReview = { text: string; name: string; source: string };
export type Guarantee = { icon: (typeof GUARANTEE_ICONS)[number]; title: string; body: string };
export type FaqItem = { q: string; a: string };
export type QualityFeature = { icon: (typeof QUALITY_ICONS)[number]; title: string; sub: string };
/** A product's own "Real product, real quality" (mmp_shop.generation › quality): one photo and up to four features. */
export type ProductQuality = { photo: string; alt: string; features: QualityFeature[] } | null;

/**
 * Trustpilot's stars for a TrustScore: rounded to the nearest half star, as Trustpilot shows them
 * (4.1 → 4, 4.3 → 4.5, 4.8 → 5). Each of the five is "full", "half" or "empty".
 */
export function trustpilotStars(score: number): ("full" | "half" | "empty")[] {
  const halves = Math.round(Math.max(0, Math.min(5, score)) * 2);
  return [0, 1, 2, 3, 4].map((i) => (halves >= (i + 1) * 2 ? "full" : halves === i * 2 + 1 ? "half" : "empty"));
}

/** Trustpilot's star colour for a score (its own scale: green from 4, light green from 3, and so on down). */
export function trustpilotColour(score: number): string {
  const s = Math.round(score * 2) / 2;
  return s >= 4 ? "#00B67A" : s >= 3 ? "#73CF11" : s >= 2 ? "#FFCE00" : s >= 1.5 ? "#FF8622" : "#FF3722";
}

/** The score as Trustpilot writes it: one decimal, e.g. "4.1". */
export const scoreText = (score: number) => score.toFixed(1);

/** "Already in their homes": the photos in two rows, the first half and the second (an odd one goes to the first). */
export function wallRows(photos: string[]): [string[], string[]] {
  const half = Math.ceil(photos.length / 2);
  return [photos.slice(0, half), photos.slice(half)];
}

/** The reviewer's initial for the round badge on a review. */
export const initialOf = (name: string) => (name.trim()[0] ?? "?").toUpperCase();
