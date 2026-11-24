import { fontFiles, type FontName } from "./fonts";

/**
 * The card fonts in the browser, shared by the card preview and the shop's personalisation layer: the brand fonts
 * come from next/font (renamed families); the Google Fonts load from public/fonts/card/ as FontFace, each file once.
 */
export function cssFamily(f: FontName): string {
  if (f !== "DM Serif Display" && f !== "Plus Jakarta Sans") return `"${f}"`;
  const v = f === "DM Serif Display" ? "--font-dmserif" : "--font-jakarta";
  const fromVar = typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(v).trim() : "";
  return fromVar || `"${f}"`;
}

let brandFonts: Promise<void> | null = null;
const faceLoads = new Map<string, Promise<void>>();

/** Loads only the fonts asked for (each file once per page), so previews stay cheap. */
export function ensureFonts(fonts: Iterable<FontName>): Promise<void> {
  brandFonts ??= Promise.all([
    document.fonts.load(`400 40px ${cssFamily("DM Serif Display")}`),
    document.fonts.load(`500 40px ${cssFamily("Plus Jakarta Sans")}`),
    document.fonts.load(`600 40px ${cssFamily("Plus Jakarta Sans")}`),
  ]).then(() => undefined, () => undefined);
  const faces = [...new Set(fonts)].flatMap((f) =>
    fontFiles(f).map(({ weight, file }) => {
      let p = faceLoads.get(file);
      if (!p) {
        const face = new FontFace(f, `url(${file})`, { weight: String(weight) });
        p = face.load().then((loaded) => void document.fonts.add(loaded), () => undefined);
        faceLoads.set(file, p);
      }
      return p;
    }),
  );
  return Promise.all([brandFonts, ...faces]).then(() => undefined);
}
