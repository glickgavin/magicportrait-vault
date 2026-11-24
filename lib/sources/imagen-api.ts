import "server-only";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { env } from "@/lib/env";
import { SourceNotConfigured } from "./index";

/**
 * Imagen's public API (docs/open-store.md › Imagen API), used only by the open store, server-side, with this
 * app's own key. CLAUDE.md, allowed write 6: new sessions through this API only; never Imagen's database.
 * The theme list, new picture sessions, their status, and fetching a finished picture to keep our own copy.
 */
export type ImagenTheme = {
  slug: string;
  name: string;
  active: boolean;
  /** How many photos the theme takes (Imagen's `input_count`, always ≥ 1); null when Imagen's list doesn't say. */
  photos: number | null;
  category: string | null;
  /**
   * A multi-photo theme's named upload roles, in order (Imagen's `inputs`); null for a one-photo theme.
   * `generate` sends one file field per role; `label` is Imagen's own wording for the slot.
   */
  inputs: ImagenInput[] | null;
};
export type ImagenInput = { role: string; label: string | null; required: boolean };

/** Imagen's session statuses; `cancelled` and `awaiting_face_selection` count as failed in the open store. */
export type ImagenStatus = "pending" | "preprocessing" | "generating" | "done" | "failed" | "cancelled" | "awaiting_face_selection";
export type ImagenImage = { id: string; url: string; width: number | null; height: number | null };
export type ImagenSession = { status: ImagenStatus; expectedImageCount: number | null; images: ImagenImage[]; costUsd: number | null };
export type GenerateInput = {
  theme: string;
  /** One per photo; empty names are left out. Private: never logged. */
  names: string[];
  /** JPEG photos, in slot order. */
  photos: Buffer[];
  /** `open-store:<visitor id>`, sent as X-Client-User-Id. */
  clientUserId: string;
  /**
   * The theme's upload roles (ImagenTheme.inputs): null for a one-photo theme. Left out, the live source looks
   * them up in Imagen's theme list.
   */
  roles?: string[] | null;
};

export interface ImagenApiSource {
  readonly kind: "live" | "fixtures";
  themes(): Promise<ImagenTheme[]>;
  generate(input: GenerateInput): Promise<{ sessionId: string; status: ImagenStatus }>;
  session(sessionId: string): Promise<ImagenSession>;
  /** A finished picture's bytes (for our copy in store-uploads). */
  download(url: string): Promise<Buffer>;
}

const STATUSES: ImagenStatus[] = ["pending", "preprocessing", "generating", "done", "failed", "cancelled", "awaiting_face_selection"];
export const asStatus = (v: unknown): ImagenStatus => (STATUSES.includes(v as ImagenStatus) ? (v as ImagenStatus) : "pending");

/** Made-up themes for tests and local dev: one takes two photos, one is inactive. */
export const FX_IMAGEN_THEMES: ImagenTheme[] = [
  { slug: "admiral-01", name: "The Admiral", active: true, photos: 1, category: "pets", inputs: null },
  { slug: "bathroom-01", name: "Bath time", active: true, photos: 1, category: "pets", inputs: null },
  { slug: "journal-02", name: "Morning paper", active: true, photos: 1, category: "pets", inputs: null },
  { slug: "plumber-01", name: "The Plumber", active: true, photos: 1, category: "pets", inputs: null },
  {
    slug: "duo-portrait-01",
    name: "Best friends",
    active: true,
    photos: 2,
    category: "pets",
    inputs: [
      { role: "pet_1", label: "First pet", required: true },
      { role: "pet_2", label: "Second pet", required: true },
    ],
  },
  { slug: "retired-01", name: "Retired style", active: false, photos: 1, category: "pets", inputs: null },
];

/**
 * Fixture sessions (DATA_SOURCE=fixtures; made-up pictures only). The session id carries everything, so they
 * survive a dev-server reload: how it behaves, the theme and when it started. The first name picks the case:
 * "Oops" fails, "Slowpoke" takes 20 s, "Forever" never finishes (for the time-out), "Faces" asks to pick faces;
 * anything else is ready after about 3 s with a 3:4 and a square result (two-photo themes get three).
 */
export const FX_TIMINGS = { ready: 3_000, slow: 20_000, fail: 1_500 } as const;
type FxCase = "ready" | "slow" | "fail" | "forever" | "faces";
const FX_SCENES: Record<string, string[]> = {
  "admiral-01": ["admiral-teddy.jpg", "admiral-cat.jpg", "tommy-boy.jpg"],
  "bathroom-01": ["bartholomew.jpg", "lamb-plumber.jpg"],
  "journal-02": ["frenchie-journal.jpg", "husky-journal.jpg"],
  "plumber-01": ["cat-plumber.jpg", "rottweiler-plumber.jpg"],
  "duo-portrait-01": ["beagle-peg.jpg", "beagle-peg-2.jpg", "shepherd-peg.jpg"],
};
const FX_SHAPES: [number, number][] = [
  [1536, 2048],
  [2048, 2048],
  [1536, 2048],
];

function fxCase(names: string[]): FxCase {
  const n = (names[0] ?? "").trim().toLowerCase();
  return n === "oops" ? "fail" : n === "slowpoke" ? "slow" : n === "forever" ? "forever" : n === "faces" ? "faces" : "ready";
}

export class ImagenApiFixtures implements ImagenApiSource {
  readonly kind = "fixtures" as const;
  constructor(private now: () => number = Date.now) {}
  async themes(): Promise<ImagenTheme[]> {
    return structuredClone(FX_IMAGEN_THEMES);
  }
  async generate(input: GenerateInput): Promise<{ sessionId: string; status: ImagenStatus }> {
    if (!input.photos.length) throw new Error("imagen_api_http_400");
    const theme = FX_IMAGEN_THEMES.find((t) => t.slug === input.theme && t.active);
    if (!theme) throw new Error("imagen_api_http_404");
    return { sessionId: `fx_${fxCase(input.names)}_${theme.slug}_${this.now()}_${randomBytes(4).toString("hex")}`, status: "pending" };
  }
  async session(sessionId: string): Promise<ImagenSession> {
    const m = /^fx_(ready|slow|fail|forever|faces)_([a-z0-9-]+)_(\d+)_[0-9a-f]+$/.exec(sessionId);
    if (!m) throw new Error("imagen_api_http_404");
    const [, c, theme, at] = m as unknown as [string, FxCase, string, string];
    const age = this.now() - Number(at);
    const scenes = FX_SCENES[theme] ?? FX_SCENES["admiral-01"];
    const count = (FX_IMAGEN_THEMES.find((t) => t.slug === theme)?.photos ?? 1) > 1 ? 3 : 2;
    const expected = { status: "pending" as ImagenStatus, expectedImageCount: count, images: [] as ImagenImage[], costUsd: null };
    if (c === "fail") return age < FX_TIMINGS.fail ? { ...expected, status: "preprocessing" } : { ...expected, status: "failed" };
    if (c === "faces") return age < FX_TIMINGS.fail ? { ...expected, status: "preprocessing" } : { ...expected, status: "awaiting_face_selection" };
    const total = c === "slow" ? FX_TIMINGS.slow : FX_TIMINGS.ready;
    if (age < total * 0.2) return expected;
    if (age < total * 0.45) return { ...expected, status: "preprocessing" };
    if (age < total || c === "forever") return { ...expected, status: "generating" };
    const images = Array.from({ length: count }, (_, i) => {
      const [w, h] = FX_SHAPES[i % FX_SHAPES.length];
      return { id: `${sessionId}_${i}`, url: `fixture://${scenes[i % scenes.length]}?w=${w}&h=${h}`, width: w, height: h };
    });
    return { status: "done", expectedImageCount: count, images, costUsd: 0.04 * count };
  }
  async download(url: string): Promise<Buffer> {
    const m = /^fixture:\/\/([a-z0-9-]+\.jpg)\?w=(\d+)&h=(\d+)$/.exec(url);
    if (!m) throw new Error("imagen_api_bad_url");
    const file = await readFile(path.join(process.cwd(), "public/shop-samples/scenes", m[1]));
    return sharp(file).resize(Number(m[2]), Number(m[3]), { fit: "cover", position: "top" }).png({ compressionLevel: 6 }).toBuffer();
  }
}

// Imagen's theme list, as its api-themes function returns it (checked against its code, 24 Nov):
// { themes: [{ id (uuid), slug, name, is_active, category: { id, slug, name } | null, input_count (≥ 1),
//   inputs?: [{ role, label, required }] (multi-photo themes only), images, … }] }
const rawInput = z.object({ role: z.string().min(1), label: z.string().nullable().optional(), required: z.boolean().optional() }).passthrough();
const rawTheme = z
  .object({
    slug: z.string().optional(),
    id: z.union([z.string(), z.number()]).optional(),
    name: z.string().optional(),
    is_active: z.boolean().optional(),
    // An object today; a bare slug is accepted too.
    category: z.union([z.string(), z.object({ slug: z.string().nullable().optional() }).passthrough()]).nullable().optional(),
    input_count: z.number().optional(),
    inputs: z.array(rawInput).nullable().optional(),
  })
  .passthrough();

export function parseThemes(body: unknown): ImagenTheme[] {
  const list = Array.isArray(body) ? body : body && typeof body === "object" ? (body as Record<string, unknown>).themes : null;
  if (!Array.isArray(list)) return [];
  const out: ImagenTheme[] = [];
  for (const item of list) {
    const r = rawTheme.safeParse(item);
    if (!r.success) continue;
    const t = r.data;
    const slug = t.slug ?? undefined;
    if (!slug || !/^[a-z0-9][a-z0-9_-]{0,80}$/.test(slug)) continue;
    const inputs = t.inputs?.length ? t.inputs.map((i) => ({ role: i.role, label: i.label ?? null, required: i.required !== false })) : null;
    const count = t.input_count ?? inputs?.length ?? null;
    const category = typeof t.category === "string" ? t.category : (t.category?.slug ?? null);
    out.push({ slug, name: t.name ?? slug, active: t.is_active ?? true, photos: count && count > 0 ? Math.round(count) : null, category, inputs });
  }
  return out;
}

/** Imagen accepts `name` as a string, or a JSON object of short parts; keys must look like `pet` or `pet_2`. */
const NAME_KEY = /^[a-z][a-z0-9_]{0,29}$/;

/**
 * The multipart body for `POST /api-generate` (checked against Imagen's code, 24 Nov). A one-photo theme takes
 * `source_image`; a multi-photo theme takes one file field per declared role and refuses `source_image`. Names
 * go as a plain string for one photo and as `{ "<role>": "<name>" }` for several.
 */
export function generateForm(input: GenerateInput, roles: string[] | null): FormData {
  const form = new FormData();
  form.set("theme_id", input.theme);
  const jpeg = (p: Buffer) => new Blob([new Uint8Array(p)], { type: "image/jpeg" });
  const names = input.names.map((n) => n.trim());
  if (roles?.length) {
    input.photos.slice(0, roles.length).forEach((p, i) => form.set(roles[i], jpeg(p), `${roles[i]}.jpg`));
    const parts = Object.fromEntries(
      roles.map((role, i) => [NAME_KEY.test(role) ? role : `pet_${i + 1}`, names[i] ?? ""] as const).filter(([, v]) => v),
    );
    if (Object.keys(parts).length) form.set("name", JSON.stringify(parts));
  } else {
    form.set("source_image", jpeg(input.photos[0]), "photo.jpg");
    const name = names.filter(Boolean).join(" & ");
    if (name) form.set("name", name);
  }
  return form;
}

const rawSession = z
  .object({
    status: z.string().optional(),
    expected_image_count: z.number().nullable().optional(),
    total_cost_usd: z.union([z.number(), z.string()]).nullable().optional(),
    // Imagen sends `url: null` when it can't make a public link for an image; those are skipped, not fatal.
    images: z
      .array(z.object({ id: z.union([z.string(), z.number()]), url: z.string().url().nullable().optional(), width: z.number().nullable().optional(), height: z.number().nullable().optional() }).passthrough())
      .nullable()
      .optional(),
  })
  .passthrough();

/** Imagen's `GET /api-sessions/<id>` body, tolerant of missing fields. */
export function parseSession(body: unknown): ImagenSession {
  const r = rawSession.safeParse(body && typeof body === "object" && "session" in body ? (body as { session: unknown }).session : body);
  if (!r.success) return { status: "pending", expectedImageCount: null, images: [], costUsd: null };
  const cost = r.data.total_cost_usd == null ? null : Number(r.data.total_cost_usd);
  return {
    status: asStatus(r.data.status),
    expectedImageCount: r.data.expected_image_count ?? null,
    images: (r.data.images ?? []).flatMap((i) => (i.url ? [{ id: String(i.id), url: i.url, width: i.width ?? null, height: i.height ?? null }] : [])),
    costUsd: Number.isFinite(cost) ? cost : null,
  };
}

/** Pictures are fetched only from Imagen's own hosts (its API host and its storage). */
const MAX_DOWNLOAD = 30 * 1024 * 1024;

export class ImagenApiLive implements ImagenApiSource {
  readonly kind = "live" as const;
  constructor(private cfg: { url: string; key: string }) {}
  private get base() {
    return this.cfg.url.replace(/\/$/, "");
  }
  async themes(): Promise<ImagenTheme[]> {
    const res = await fetch(`${this.base}/api-themes`, { headers: { authorization: `Bearer ${this.cfg.key}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`imagen_api_http_${res.status}`);
    return parseThemes(await res.json());
  }
  async generate(input: GenerateInput): Promise<{ sessionId: string; status: ImagenStatus }> {
    const roles = input.roles !== undefined ? input.roles : ((await this.themes()).find((t) => t.slug === input.theme)?.inputs?.map((i) => i.role) ?? null);
    const form = generateForm(input, roles);
    const res = await fetch(`${this.base}/api-generate`, { method: "POST", headers: { authorization: `Bearer ${this.cfg.key}`, "x-client-user-id": input.clientUserId }, body: form, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`imagen_api_http_${res.status}`);
    const body = (await res.json()) as { session_id?: unknown; status?: unknown };
    if (typeof body.session_id !== "string" || !body.session_id) throw new Error("imagen_api_no_session");
    return { sessionId: body.session_id, status: asStatus(body.status) };
  }
  async session(sessionId: string): Promise<ImagenSession> {
    const res = await fetch(`${this.base}/api-sessions/${encodeURIComponent(sessionId)}`, { headers: { authorization: `Bearer ${this.cfg.key}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`imagen_api_http_${res.status}`);
    return parseSession(await res.json());
  }
  async download(url: string): Promise<Buffer> {
    const u = new URL(url);
    const apiHost = new URL(this.base).host;
    if (u.protocol !== "https:" || u.host !== apiHost) throw new Error("imagen_api_bad_url");
    const res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`imagen_api_http_${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_DOWNLOAD) throw new Error("imagen_api_too_large");
    return buf;
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
