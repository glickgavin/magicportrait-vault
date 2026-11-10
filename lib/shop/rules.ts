import { IMAGE_KINDS, MAKERS, PLACEMENTS } from "./fields";
import type { RawMetafield } from "./sources/types";

/** A variant's print rules, from its `mmp_shop` metafields (docs/shop.md › Product rules). */
export type VariantRules = {
  maker: (typeof MAKERS)[number];
  makerSku: string;
  printPx: { w: number; h: number };
  /** wrap_zone only: the part of the print area the picture fills (e.g. one side of a mug). */
  zonePx: { w: number; h: number } | null;
  placement: (typeof PLACEMENTS)[number];
  minShortSidePx: number;
  maxCropPct: number;
  adjustable: boolean;
  imageKinds: (typeof IMAGE_KINDS)[number];
  background: string | null;
  extra: Record<string, unknown>;
  /** The latest updatedAt of the variant's rule metafields, so an order records which rules it used. */
  version: string | null;
};

export type RuleDefaults = { minShortSidePx: number; maxCropPct: number };
export const RULE_DEFAULTS: RuleDefaults = { minShortSidePx: 1000, maxCropPct: 30 };

/** The rules a variant must have before it can be sold. */
export const REQUIRED_RULES = ["maker", "maker_sku", "print_px"] as const;

export type ParsedRules = { ok: true; rules: VariantRules } | { ok: false; missing: string[]; invalid: string[] };

export function parsePx(v: string | undefined): { w: number; h: number } | null {
  const m = /^\s*(\d{2,5})\s*[x×]\s*(\d{2,5})\s*$/i.exec(v ?? "");
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w > 0 && h > 0 ? { w, h } : null;
}

const oneOf = <T extends readonly string[]>(list: T, v: string | undefined): T[number] | null => {
  const s = (v ?? "").trim().toLowerCase();
  return (list as readonly string[]).includes(s) ? (s as T[number]) : null;
};

/** Pure: never throws. Missing optional rules take their defaults; bad values are reported as invalid. */
export function parseVariantRules(metafields: RawMetafield[], defaults: RuleDefaults = RULE_DEFAULTS): ParsedRules {
  const m = new Map(metafields.map((f) => [f.key, f.value]));
  const missing: string[] = [];
  const invalid: string[] = [];
  for (const k of REQUIRED_RULES) if (!m.get(k)?.trim()) missing.push(k);

  const maker = oneOf(MAKERS, m.get("maker"));
  if (m.get("maker")?.trim() && !maker) invalid.push("maker");
  const printPx = parsePx(m.get("print_px"));
  if (m.get("print_px")?.trim() && !printPx) invalid.push("print_px");

  const zoneRaw = m.get("zone_px");
  const zonePx = zoneRaw?.trim() ? parsePx(zoneRaw) : null;
  if (zoneRaw?.trim() && !zonePx) invalid.push("zone_px");

  const placementRaw = m.get("placement");
  const placement = placementRaw?.trim() ? oneOf(PLACEMENTS, placementRaw) : "cover";
  if (!placement) invalid.push("placement");
  const kindsRaw = m.get("image_kinds");
  const imageKinds = kindsRaw?.trim() ? oneOf(IMAGE_KINDS, kindsRaw) : "both";
  if (!imageKinds) invalid.push("image_kinds");

  const int = (k: string, d: number, min: number, max: number) => {
    const raw = m.get(k);
    if (!raw?.trim()) return d;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      invalid.push(k);
      return d;
    }
    return n;
  };
  const minShortSidePx = int("min_short_side_px", defaults.minShortSidePx, 1, 20000);
  const maxCropPct = int("max_crop_pct", defaults.maxCropPct, 0, 90);

  const adjRaw = m.get("adjustable")?.trim().toLowerCase();
  const adjustable = adjRaw === undefined || adjRaw === "" ? true : adjRaw === "true";
  if (adjRaw && adjRaw !== "true" && adjRaw !== "false") invalid.push("adjustable");

  const bgRaw = m.get("background")?.trim();
  const background = bgRaw ? (/^#[0-9a-f]{6}$/i.test(bgRaw) ? bgRaw.toUpperCase() : null) : null;
  if (bgRaw && !background) invalid.push("background");

  let extra: Record<string, unknown> = {};
  const extraRaw = m.get("extra")?.trim();
  if (extraRaw) {
    try {
      const v = JSON.parse(extraRaw) as unknown;
      if (v && typeof v === "object" && !Array.isArray(v)) extra = v as Record<string, unknown>;
      else invalid.push("extra");
    } catch {
      invalid.push("extra");
    }
  }

  if (missing.length || invalid.length || !maker || !printPx || !placement || !imageKinds) return { ok: false, missing, invalid };
  const ruleKeys = new Set(["maker", "maker_sku", "print_px", "zone_px", "placement", "min_short_side_px", "max_crop_pct", "adjustable", "image_kinds", "background", "extra"]);
  const version = metafields.filter((f) => ruleKeys.has(f.key) && f.updatedAt).map((f) => f.updatedAt as string).sort().at(-1) ?? null;
  return {
    ok: true,
    rules: { maker, makerSku: (m.get("maker_sku") ?? "").trim(), printPx, zonePx: placement === "wrap_zone" ? zonePx : null, placement, minShortSidePx, maxCropPct, adjustable, imageKinds, background, extra, version },
  };
}
