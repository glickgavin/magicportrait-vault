/** Turns a stored artwork path into a URL the browser can load. */
export function themeAssetUrl(p: string | null | undefined, supabaseUrl?: string): string | null {
  if (!p) return null;
  if (p.startsWith("builtin:")) return `/theme-placeholders/${p.slice("builtin:".length)}`;
  if (/^https?:\/\//.test(p) || p.startsWith("/")) return p;
  const base = (supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/theme-assets/${p.replace(/^theme-assets\//, "")}`;
}
