import type { FieldDefinitionSpec } from "./sources/types";

/**
 * The `mmp_shop` metafields (docs/shop.md › Products… and Product rules). Settings › Shop can create
 * any that are missing; their values are edited in Shopify admin, or in Settings for page and occasions.
 */
export const PAGE_CHOICES = ["Gifts", "Products", "All"] as const;
export const MAKERS = ["gelato", "prodigi", "dreamship", "in_house"] as const;
export const PLACEMENTS = ["cover", "contain", "wrap_zone"] as const;
export const IMAGE_KINDS = ["portraits", "photos", "both"] as const;

const MAGIC = "Only for products in the Magic Store collection (my.magicportraits.ai/store).";

export function fieldSpecs(occasionChoices: string[], categoryChoices: string[] = [], themeChoices: string[] = []): FieldDefinitionSpec[] {
  return [
    { ownerType: "PRODUCT", key: "page", name: "Shop page", type: "single_line_text_field", description: "Which My Magic Portraits page shows this product: Gifts, Products or All (both).", choices: [...PAGE_CHOICES] },
    { ownerType: "PRODUCT", key: "occasions", name: "Shop occasions", type: "list.single_line_text_field", description: "Occasions this product suits, for the Gifts page.", choices: occasionChoices.length ? occasionChoices : undefined },
    { ownerType: "PRODUCT", key: "categories", name: "Shop categories", type: "list.single_line_text_field", description: "Categories this product sits under on the My Magic Portraits Products page.", choices: categoryChoices.length ? categoryChoices : undefined },
    { ownerType: "PRODUCT", key: "short_description", name: "Shop short description", type: "multi_line_text_field", description: "What My Magic Portraits shows on the product sheet instead of the full description: a sentence or two, then lines starting with \"- \" for bullets. About 4 to 5 lines on a phone. Empty: the product's own description." },
    { ownerType: "PRODUCT", key: "template", name: "Shop preview template", type: "json", description: "Where the picture sits on the blank product photo. Set by the template editor in My Magic Portraits Settings." },
    // The Magic Store's fields (docs/open-store.md › Generation settings in Shopify); created in Shopify on 23 Nov.
    { ownerType: "PRODUCT", key: "imagen_theme", name: "Magic Store theme", type: "single_line_text_field", description: `${MAGIC} The Imagen theme (art style) a visitor's picture is made in.`, choices: themeChoices.length ? themeChoices : undefined },
    { ownerType: "PRODUCT", key: "generation", name: "Magic Store picture settings", type: "json", description: `${MAGIC} Photo and name labels, name length, photo tips, step labels, results to show; each falls back to the store's setting.` },
    { ownerType: "PRODUCT", key: "related", name: "Magic Store more gifts", type: "list.product_reference", description: `${MAGIC} The products under "On more gifts", in order.` },
    { ownerType: "PRODUCT", key: "open_store_related", name: "Magic Store related only", type: "boolean", description: `${MAGIC} Shown only under "On more gifts", never in the grid.` },
    { ownerType: "PRODUCT", key: "details", name: "Magic Store size and materials", type: "multi_line_text_field", description: `${MAGIC} Shown under Product details.` },
    { ownerType: "PRODUCTVARIANT", key: "maker", name: "Shop maker", type: "single_line_text_field", description: "Who makes it: gelato, prodigi, dreamship or in_house.", choices: [...MAKERS] },
    { ownerType: "PRODUCTVARIANT", key: "maker_sku", name: "Shop maker's product code", type: "single_line_text_field", description: "The maker's product code, e.g. a Gelato product uid, a Prodigi SKU or a Dreamship item variant id." },
    { ownerType: "PRODUCTVARIANT", key: "print_px", name: "Shop print area (px)", type: "single_line_text_field", description: "Width x height in pixels, e.g. 2400x3000." },
    { ownerType: "PRODUCTVARIANT", key: "zone_px", name: "Shop picture zone (px)", type: "single_line_text_field", description: "wrap_zone only: the part of the print area the picture fills, e.g. 1155x1155 on one side of a mug." },
    { ownerType: "PRODUCTVARIANT", key: "placement", name: "Shop placement", type: "single_line_text_field", description: "cover (fill and crop), contain (fit on a background) or wrap_zone.", choices: [...PLACEMENTS] },
    { ownerType: "PRODUCTVARIANT", key: "min_short_side_px", name: "Shop smallest image (px)", type: "number_integer", description: "The picture's short side must be at least this many pixels." },
    { ownerType: "PRODUCTVARIANT", key: "max_crop_pct", name: "Shop most it may crop (%)", type: "number_integer", description: "Hide this size for pictures whose shape would lose more than this." },
    { ownerType: "PRODUCTVARIANT", key: "adjustable", name: "Shop customers can adjust", type: "boolean", description: "Show Adjust on the product sheet." },
    { ownerType: "PRODUCTVARIANT", key: "image_kinds", name: "Shop which pictures", type: "single_line_text_field", description: "portraits, photos or both.", choices: [...IMAGE_KINDS] },
    { ownerType: "PRODUCTVARIANT", key: "background", name: "Shop background colour", type: "color", description: "Only for contain placement." },
    { ownerType: "PRODUCTVARIANT", key: "extra", name: "Shop extra for the maker", type: "json", description: "Passed to the maker untouched on the order line." },
    { ownerType: "PRODUCTVARIANT", key: "badge", name: "Magic Store badge", type: "single_line_text_field", description: `${MAGIC} A short label on the size chip, e.g. Bestseller.` },
    { ownerType: "PRODUCTVARIANT", key: "lead_days", name: "Magic Store making time (working days)", type: "single_line_text_field", description: `${MAGIC} Working days to make it, e.g. 4-6.` },
  ];
}

/** Normalises `mmp_shop.page` ("Gifts", "gifts ", "ALL") to gifts | products | all, or null. */
export function normalisePage(v: string | null | undefined): "gifts" | "products" | "all" | null {
  const s = (v ?? "").trim().toLowerCase();
  return s === "gifts" || s === "products" || s === "all" ? s : null;
}

export function pageLabel(p: "gifts" | "products" | "all"): (typeof PAGE_CHOICES)[number] {
  return p === "gifts" ? "Gifts" : p === "products" ? "Products" : "All";
}

/** Parses a list metafield's JSON value; anything else gives []. */
export function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const v = JSON.parse(value) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : [];
  } catch {
    return [];
  }
}
