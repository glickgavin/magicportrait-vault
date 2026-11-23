import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import { SourceNotConfigured } from "./index";

/**
 * Imagen's public API (docs/open-store.md › Imagen API), used only by the open store, server-side, with this
 * app's own key. CLAUDE.md, allowed write 6: new sessions through this API only; never Imagen's database.
 * Open store 1 reads the theme list; picture sessions are added in Open store 3.
 */
export type ImagenTheme = {
  slug: string;
  name: string;
  active: boolean;
  /** How many photos the theme takes; null when Imagen's list doesn't say. */
  photos: number | null;
  category: string | null;
};

export interface ImagenApiSource {
  readonly kind: "live" | "fixtures";
  themes(): Promise<ImagenTheme[]>;
}

/** Made-up themes for tests and local dev: one takes two photos, one is inactive. */
export const FX_IMAGEN_THEMES: ImagenTheme[] = [
  { slug: "admiral-01", name: "The Admiral", active: true, photos: 1, category: "pets" },
  { slug: "bathroom-01", name: "Bath time", active: true, photos: 1, category: "pets" },
  { slug: "journal-02", name: "Morning paper", active: true, photos: 1, category: "pets" },
  { slug: "plumber-01", name: "The Plumber", active: true, photos: 1, category: "pets" },
  { slug: "duo-portrait-01", name: "Best friends", active: true, photos: 2, category: "pets" },
  { slug: "retired-01", name: "Retired style", active: false, photos: 1, category: "pets" },
];

export class ImagenApiFixtures implements ImagenApiSource {
  readonly kind = "fixtures" as const;
  async themes(): Promise<ImagenTheme[]> {
    return structuredClone(FX_IMAGEN_THEMES);
  }
}

// Imagen's theme list: the field names below are the likely ones; which field says how many photos a theme
// takes is still to confirm with Imagen (docs/open-store.md › Open questions), so several are accepted.
const rawTheme = z
  .object({
    slug: z.string().optional(),
    id: z.union([z.string(), z.number()]).optional(),
    theme_id: z.string().optional(),
    name: z.string().optional(),
    title: z.string().optional(),
    is_active: z.boolean().optional(),
    active: z.boolean().optional(),
    category: z.string().nullable().optional(),
    required_images: z.number().optional(),
    image_count: z.number().optional(),
    photos: z.number().optional(),
    num_images: z.number().optional(),
    min_images: z.number().optional(),
  })
  .passthrough();

export function parseThemes(body: unknown): ImagenTheme[] {
  const list = Array.isArray(body) ? body : body && typeof body === "object" ? ((body as Record<string, unknown>).themes ?? (body as Record<string, unknown>).data) : null;
  if (!Array.isArray(list)) return [];
  const out: ImagenTheme[] = [];
  for (const item of list) {
    const r = rawTheme.safeParse(item);
    if (!r.success) continue;
    const t = r.data;
    const slug = t.slug ?? t.theme_id ?? (typeof t.id === "string" ? t.id : undefined);
    if (!slug || !/^[a-z0-9][a-z0-9_-]{0,80}$/.test(slug)) continue;
    const photos = t.required_images ?? t.image_count ?? t.photos ?? t.num_images ?? t.min_images ?? null;
    out.push({ slug, name: t.name ?? t.title ?? slug, active: t.is_active ?? t.active ?? true, photos: photos && photos > 0 ? Math.round(photos) : null, category: t.category ?? null });
  }
  return out;
}

export class ImagenApiLive implements ImagenApiSource {
  readonly kind = "live" as const;
  constructor(private cfg: { url: string; key: string }) {}
  async themes(): Promise<ImagenTheme[]> {
    const res = await fetch(`${this.cfg.url.replace(/\/$/, "")}/api-themes`, { headers: { authorization: `Bearer ${this.cfg.key}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`imagen_api_http_${res.status}`);
    return parseThemes(await res.json());
  }
}

/** Fixtures under DATA_SOURCE=fixtures, else Imagen's live API with IMAGEN_API_URL and IMAGEN_API_KEY (Vercel env only). */
export function getImagenApi(): ImagenApiSource {
  if (env.dataSource === "fixtures") return new ImagenApiFixtures();
  const url = env.optional("IMAGEN_API_URL");
  const key = env.optional("IMAGEN_API_KEY");
  if (!url || !key) throw new SourceNotConfigured("imagen_api");
  return new ImagenApiLive({ url, key });
}
