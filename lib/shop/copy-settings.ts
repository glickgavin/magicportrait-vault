import type { ShopProduct } from "@/lib/shop/sources/types";
import { parseTemplate, type Template } from "@/lib/shop/template";

/**
 * "Copy settings from…" on Settings › Shop › one product (docs/shop.md › Copy settings): a new product made by
 * duplicating another (same printing, a new theme and photos) takes the other's settings in one go. Pure: works out
 * what to write; `lib/shop/copy.ts` writes it through the same writers as the product page (allowed write 5).
 *
 * Never copied: the Imagen theme, the Dreamship link and the print rules (maker, SKU, print_px, extra). Those differ
 * per product, and Dreamship's Sync fills the print rules.
 */

export const COPY_PARTS = ["template", "magic_store", "sizes", "pages"] as const;
export type CopyPart = (typeof COPY_PARTS)[number];

export const COPY_PART_TEXT: Record<CopyPart, string> = {
  template: "Preview template (where the picture goes, the mask and the personalisation layer); the background becomes this product's own first photo",
  magic_store: "Magic Store fields: picture settings, details, short description and more gifts (never the theme)",
  sizes: "Badges and lead times, matched by size name",
  pages: "Gifts & Products pages: page, occasions and categories",
};

/** A size's name reduced to its numbers and units, so '12x16"' matches "12 × 16 in". */
export function sizeKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[×✕]/g, "x")
    .replace(/["”″]|inches|inch|\bin\b/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export type CopyPlan = {
  template: Template | null;
  /** Shared and Magic Store fields, in the shape `updateStoreFields` takes (null clears a field). */
  fields: {
    short_description?: string | null;
    related?: string[] | null;
    open_store_related?: boolean | null;
    details?: string | null;
    generation?: Record<string, unknown>;
  } | null;
  variants: { variantId: string; badge: string | null; lead_days: string | null }[];
  pages: { page: string | null; occasions: string[]; categories: string[] } | null;
  /** What couldn't be copied, in words for the summary. */
  skipped: string[];
};

const GENERATION_KEYS = ["photos", "ask_name", "name_max", "photo_tips", "subject", "images_to_show", "step_labels", "quality"] as const;

export function planCopy(from: ShopProduct, to: ShopProduct, parts: readonly CopyPart[]): CopyPlan {
  const plan: CopyPlan = { template: null, fields: null, variants: [], pages: null, skipped: [] };
  const want = new Set(parts);

  if (want.has("template")) {
    const t = parseTemplate(from.template?.value);
    const photo = to.media[0];
    if (!t) plan.skipped.push(`${from.title} has no preview template.`);
    else if (!photo) plan.skipped.push("This product has no photo in Shopify to use as the template's background.");
    else {
      // The overlay is kept unless it's one of the other product's own gallery photos (that would show its product here).
      const overlayIsTheirs = t.overlay && from.media.some((m) => m.id === t.overlay!.media_id);
      if (overlayIsTheirs) plan.skipped.push("The overlay was one of the other product's own photos, so it wasn't copied.");
      plan.template = {
        ...t,
        background: { media_id: photo.id, url: photo.url, w: photo.width ?? t.background.w, h: photo.height ?? t.background.h },
        overlay: overlayIsTheirs ? null : t.overlay,
        // Photos per option (frame colours) are the other product's own: set them again here.
        scenes: undefined,
        updated_at: undefined,
      };
    }
  }

  if (want.has("magic_store")) {
    if (!from.store) plan.skipped.push(`${from.title} isn't in the Magic Store, so it has no Magic Store fields.`);
    else if (!to.store) plan.skipped.push("This product isn't in the Magic Store collection, so its Magic Store fields weren't set.");
    else {
      let gen: Record<string, unknown> = {};
      try {
        const g = from.store.generation ? (JSON.parse(from.store.generation) as unknown) : {};
        if (g && typeof g === "object" && !Array.isArray(g)) gen = g as Record<string, unknown>;
      } catch {
        plan.skipped.push(`${from.title}'s picture settings aren't valid, so they weren't copied.`);
      }
      // Every generation key is sent: copied when set, cleared (store default) when not.
      const generation: Record<string, unknown> = {};
      for (const k of GENERATION_KEYS) generation[k] = gen[k] ?? null;
      plan.fields = {
        short_description: from.shortDescription ?? null,
        details: from.store.details ?? null,
        related: from.store.related.filter((id) => id !== to.id),
        open_store_related: from.store.relatedOnly === "true" ? true : null,
        generation,
      };
    }
  }

  if (want.has("sizes")) {
    if (!to.store) plan.skipped.push("Badges and lead times are Magic Store fields; this product isn't in the Magic Store collection.");
    else {
      const theirs = new Map(from.variants.map((v) => [sizeKey(v.title), v]));
      for (const v of to.variants) {
        const match = theirs.get(sizeKey(v.title));
        if (!match) {
          plan.skipped.push(`No size called “${v.title}” on ${from.title}.`);
          continue;
        }
        const get = (k: string) => match.metafields.find((m) => m.key === k)?.value?.trim() || null;
        plan.variants.push({ variantId: v.id, badge: get("badge"), lead_days: get("lead_days") });
      }
    }
  }

  if (want.has("pages")) plan.pages = { page: from.page, occasions: from.occasions, categories: from.categories };
  return plan;
}
