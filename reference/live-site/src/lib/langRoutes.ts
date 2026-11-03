// URL-based language routing.
//
// English is the default and remains UNPREFIXED (/start), so every existing
// URL, ad link, and inbound link keeps working untouched. Other languages are
// served from a path prefix (/es/start, /fr/start).

export const DEFAULT_LANG = 'en' as const;
export const SUPPORTED_LANGS = ['es', 'fr', 'it', 'de'] as const;

export type Lang = typeof DEFAULT_LANG | (typeof SUPPORTED_LANGS)[number];

/** All languages, including the default. */
export const ALL_LANGS: readonly Lang[] = [DEFAULT_LANG, ...SUPPORTED_LANGS];

function isSupported(seg: string): seg is (typeof SUPPORTED_LANGS)[number] {
  return (SUPPORTED_LANGS as readonly string[]).includes(seg);
}

/** Read the active language from a pathname. Unknown/absent prefix → 'en'. */
export function langFromPath(pathname: string): Lang {
  const seg = pathname.split('/')[1] ?? '';
  return isSupported(seg) ? seg : DEFAULT_LANG;
}

/** Strip any language prefix, returning the canonical English path. */
export function stripLang(pathname: string): string {
  const seg = pathname.split('/')[1] ?? '';
  if (!isSupported(seg)) return pathname;
  const rest = pathname.slice(seg.length + 1);
  return rest.startsWith('/') ? rest : `/${rest}`;
}

/** Prefix a path for a language. English is returned unprefixed. */
export function localizePath(path: string, lang: Lang): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (lang === DEFAULT_LANG) return clean;
  return `/${lang}${clean}`;
}
