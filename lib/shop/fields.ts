import type { FieldDefinitionSpec } from "./sources/types";

/**
 * The `mmp_shop` metafields (docs/shop.md › Products… and Product rules). Settings › Shop can create
 * any that are missing; their values are edited in Shopify admin, or in Settings for page and occasions.
 */
export const PAGE_CHOICES = ["Gifts", "Products", "All"] as const;
export const MAKERS = ["gelato", "prodigi", "in_house"] as const;
export const PLACEMENTS = ["cover", "contain", "wrap_zone"] as const;
export const IMAGE_KINDS = ["portraits", "photos", "both"] as const;

export function fieldSpecs(occasionChoices: string[]): FieldDefinitionSpec[] {
  return [
    { ownerType: "PRODUCT", key: "page", name: "Shop page", type: "single_line_text_field", description: "Which My Magic Portraits page shows this product: Gifts, Products or All (both).", choices: [...PAGE_CHOICES] },
    { ownerType: "PRODUCT", key: "occasions", name: "Shop occasions", type: "list.single_line_text_field", description: "Occasions this product suits, for the Gifts page.", choices: occasionChoices.length ? occasionChoices : undefined },
    { ownerType: "PRODUCT", key: "template", name: "Shop preview template", type: "json", description: "Where the picture sits on the blank product photo. Set by the template editor in My Magic Portraits Settings." },
    { ownerType: "PRODUCTVARIANT", key: "maker", name: "Shop maker", type: "single_line_text_field", description: "Who makes it: gelato, prodigi or in_house.", choices: [...MAKERS] },
    { ownerType: "PRODUCTVARIANT", key: "maker_sku", name: "Shop maker's product code", type: "single_line_text_field", description: "The maker's product code, e.g. a Gelato product uid or a Prodigi SKU." },
    { ownerType: "PRODUCTVARIANT", key: "print_px", name: "Shop print area (px)", type: "single_line_text_field", description: "Width x height in pixels, e.g. 2400x3000." },
    { ownerType: "PRODUCTVARIANT", key: "placement", name: "Shop placement", type: "single_line_text_field", description: "cover (fill and crop), contain (fit on a background) or wrap_zone.", choices: [...PLACEMENTS] },
    { ownerType: "PRODUCTVARIANT", key: "min_short_side_px", name: "Shop smallest image (px)", type: "number_integer", description: "The picture's short side must be at least this many pixels." },
    { ownerType: "PRODUCTVARIANT", key: "max_crop_pct", name: "Shop most it may crop (%)", type: "number_integer", description: "Hide this size for pictures whose shape would lose more than this." },
    { ownerType: "PRODUCTVARIANT", key: "adjustable", name: "Shop customers can adjust", type: "boolean", description: "Show Adjust on the product sheet." },
    { ownerType: "PRODUCTVARIANT", key: "image_kinds", name: "Shop which pictures", type: "single_line_text_field", description: "portraits, photos or both.", choices: [...IMAGE_KINDS] },
    { ownerType: "PRODUCTVARIANT", key: "background", name: "Shop background colour", type: "color", description: "Only for contain placement." },
    { ownerType: "PRODUCTVARIANT", key: "extra", name: "Shop extra for the maker", type: "json", description: "Passed to the maker untouched on the order line." },
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
