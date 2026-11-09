/**
 * The card fonts: one list shared by the layout schema, the template editor, the server renderer
 * (@napi-rs/canvas registers the files) and the browser preview (loads the same files as FontFace).
 * All are Google Fonts under the SIL Open Font License; the files live in public/fonts/card/
 * (fetched by scripts/fetch-card-fonts.mjs from the Fontsource packages, latin subset).
 * The first two are the brand fonts, shipped from assets/fonts/ and loaded in the browser by next/font.
 */
export type FontDef = { name: string; group: "Serif" | "Sans" | "Script"; weights: number[]; defaultWeight: number; slug?: string };

export const FONT_DEFS = [
  { name: "DM Serif Display", group: "Serif", weights: [400], defaultWeight: 400 },
  { name: "Plus Jakarta Sans", group: "Sans", weights: [400, 500, 600, 700, 800], defaultWeight: 500 },
  { name: "Playfair Display", group: "Serif", weights: [400, 700], defaultWeight: 400, slug: "playfair-display" },
  { name: "Lora", group: "Serif", weights: [400, 700], defaultWeight: 400, slug: "lora" },
  { name: "Cormorant Garamond", group: "Serif", weights: [400, 700], defaultWeight: 400, slug: "cormorant-garamond" },
  { name: "Montserrat", group: "Sans", weights: [400, 700], defaultWeight: 400, slug: "montserrat" },
  { name: "Poppins", group: "Sans", weights: [400, 700], defaultWeight: 400, slug: "poppins" },
  { name: "Nunito", group: "Sans", weights: [400, 700], defaultWeight: 400, slug: "nunito" },
  { name: "Great Vibes", group: "Script", weights: [400], defaultWeight: 400, slug: "great-vibes" },
  { name: "Dancing Script", group: "Script", weights: [400, 700], defaultWeight: 400, slug: "dancing-script" },
  { name: "Pacifico", group: "Script", weights: [400], defaultWeight: 400, slug: "pacifico" },
  { name: "Caveat", group: "Script", weights: [400, 700], defaultWeight: 400, slug: "caveat" },
  { name: "Lobster", group: "Script", weights: [400], defaultWeight: 400, slug: "lobster" },
  { name: "Amatic SC", group: "Script", weights: [400, 700], defaultWeight: 400, slug: "amatic-sc" },
] as const satisfies readonly FontDef[];

export type FontName = (typeof FONT_DEFS)[number]["name"];
export const FONTS = FONT_DEFS.map((f) => f.name) as [FontName, ...FontName[]];

export function fontDef(name: FontName): FontDef {
  return FONT_DEFS.find((f) => f.name === name)!;
}

/** The Google Font files (not the two brand fonts): public path per weight. */
export function fontFiles(name: FontName): { weight: number; file: string }[] {
  const d = fontDef(name);
  if (!d.slug) return [];
  return d.weights.map((w) => ({ weight: w, file: `/fonts/card/${d.slug}-latin-${w}-normal.woff2` }));
}

/** The weight a zone draws with: its own (snapped to one the font has), else the font's default. */
export function weightFor(name: FontName, wanted?: number): number {
  const d = fontDef(name);
  if (!wanted) return d.defaultWeight;
  return d.weights.reduce((best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best), d.weights[0]);
}
