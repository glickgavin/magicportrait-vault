import "server-only";
import { randomBytes } from "node:crypto";
import { generateText } from "ai";
import { db } from "@/lib/db/client";
import { getSettings } from "@/lib/settings";
import { putObject, removeObjects } from "@/lib/storage";
import { aspectRatio, dayStamp, parseSceneFileName, pictureSlug, sceneFileName, scenePrompt, type SceneFile, type ScenePreset, type SceneProduct } from "@/lib/shop/scene-presets";

/**
 * Room photos for the Store products, made with an image model through Vercel AI Gateway (the deployment's
 * OIDC token authenticates; no key in the app). Results are product photos, not customer data, so they
 * live in the public theme-assets bucket under shop-scenes/<product handle>/ (never in Shopify).
 */
export const SCENE_FOLDER = "shop-scenes";

export type Scene = SceneFile & { handle: string; key: string; url: string };

function publicBase(): string {
  return `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "")}/storage/v1/object/public/theme-assets/${SCENE_FOLDER}/`;
}

const HANDLE = /^[a-z0-9-]{1,120}$/;

/** Every room photo made for these products, newest first. */
export async function listScenes(handles: string[]): Promise<Scene[]> {
  const base = publicBase();
  const lists = await Promise.all(
    [...new Set(handles)].filter((h) => HANDLE.test(h)).map(async (handle) => {
      const { data, error } = await db().storage.from("theme-assets").list(`${SCENE_FOLDER}/${handle}`, { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
      if (error || !data) return [];
      return data.flatMap((f) => {
        const p = parseSceneFileName(f.name);
        return p ? [{ ...p, handle, key: `${SCENE_FOLDER}/${handle}/${f.name}`, url: `${base}${handle}/${f.name}` }] : [];
      });
    }),
  );
  return lists.flat().sort((a, b) => (a.day === b.day ? 0 : a.day < b.day ? 1 : -1));
}

/** The storage key of a room photo, or null when the text isn't one. */
export function sceneKey(key: string): string | null {
  const m = /^shop-scenes\/([a-z0-9-]{1,120})\/([^/]+)$/.exec(key);
  return m && parseSceneFileName(m[2]) ? key : null;
}

export async function deleteScene(key: string): Promise<boolean> {
  const k = sceneKey(key);
  if (!k) return false;
  await removeObjects("theme-assets", [k]);
  return true;
}

/** The picture cropped to the product's print shape (the model then prints it edge to edge). */
export async function cropToPrint(picture: Buffer, printAspect: string, maxPx = 1600): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(picture).rotate().metadata();
  const w0 = meta.autoOrient?.width ?? meta.width ?? 0;
  const h0 = meta.autoOrient?.height ?? meta.height ?? 0;
  if (!w0 || !h0) throw new Error("not_an_image");
  const r = aspectRatio(printAspect);
  let w = w0;
  let h = Math.round(w0 / r);
  if (h > h0) {
    h = h0;
    w = Math.round(h0 * r);
  }
  const scale = Math.min(1, maxPx / Math.max(w, h));
  return sharp(picture)
    .rotate()
    .resize(Math.round(w * scale), Math.round(h * scale), { fit: "cover", position: "attention" })
    .jpeg({ quality: 92 })
    .toBuffer();
}

export type SceneRefusal = "no_credit" | "not_authorised" | "busy" | "no_image" | "timeout" | "failed";

function refusalOf(e: unknown): SceneRefusal {
  const err = e as { statusCode?: number; status?: number; name?: string; message?: string; cause?: unknown };
  const status = err?.statusCode ?? err?.status;
  const text = `${err?.name ?? ""} ${err?.message ?? ""}`.toLowerCase();
  if (err?.name === "TimeoutError" || err?.name === "AbortError" || text.includes("aborted")) return "timeout";
  if (status === 402 || text.includes("insufficient") || text.includes("credit") || text.includes("payment")) return "no_credit";
  if (status === 401 || status === 403 || text.includes("authentication") || text.includes("oidc") || text.includes("api key")) return "not_authorised";
  if (status === 429 || text.includes("rate limit")) return "busy";
  return "failed";
}

export type MakeSceneInput = {
  preset: ScenePreset;
  product: SceneProduct;
  productPhoto: Buffer | null;
  picture: Buffer;
  pictureName: string;
  note?: string;
};

export type MakeSceneResult = { ok: true; scene: Scene; ms: number } | { ok: false; reason: SceneRefusal; detail?: string };

/** Asks the model for one room photo and keeps it. */
export async function makeScene(input: MakeSceneInput): Promise<MakeSceneResult> {
  const s = await getSettings(["shop.scene_model", "shop.scene_image_size", "shop.scene_prompt_rules"] as const);
  const sharp = (await import("sharp")).default;
  const printed = await cropToPrint(input.picture, input.product.print_aspect);
  let text = scenePrompt(s["shop.scene_prompt_rules"], input.product, input.preset, input.note);
  const images: Buffer[] = [];
  if (input.productPhoto) {
    images.push(await sharp(input.productPhoto).resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer());
  } else {
    // No studio photo: the rules' line about the first image doesn't apply.
    text = text.replace(/The first image shows this product[^\n]*\n*/, "").replace("The second image is", "The image is");
  }
  images.push(printed);
  const content = [{ type: "text" as const, text }, ...images.map((image) => ({ type: "image" as const, image, mediaType: "image/jpeg" }))];

  const imageConfig = { aspectRatio: input.preset.photo_aspect, imageSize: s["shop.scene_image_size"] };
  const started = Date.now();
  let result;
  try {
    result = await generateText({
      model: s["shop.scene_model"],
      messages: [{ role: "user", content }],
      providerOptions: {
        google: { responseModalities: ["TEXT", "IMAGE"], imageConfig },
        vertex: { responseModalities: ["TEXT", "IMAGE"], imageConfig },
      },
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(240_000),
    });
  } catch (e) {
    const reason = refusalOf(e);
    console.warn(`[scenes] ${input.preset.id}: ${reason} ${String((e as Error)?.message ?? e).slice(0, 300)}`);
    return { ok: false, reason };
  }
  const file = result.files.find((f) => f.mediaType.startsWith("image/"));
  if (!file) return { ok: false, reason: "no_image", detail: (result.text ?? "").trim().slice(0, 400) || undefined };

  const out = await sharp(Buffer.from(file.uint8Array)).resize(2400, 2400, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const f: SceneFile = { day: dayStamp(), preset: input.preset.id, picture: pictureSlug(input.pictureName), id: randomBytes(6).toString("hex"), width: out.info.width, height: out.info.height };
  const name = sceneFileName(f);
  const key = `${SCENE_FOLDER}/${input.preset.product}/${name}`;
  await putObject("theme-assets", key, out.data, "image/jpeg");
  return { ok: true, scene: { ...f, handle: input.preset.product, key, url: `${publicBase()}${input.preset.product}/${name}` }, ms: Date.now() - started };
}

/** How many room photos were made today (UTC), across these products. */
export async function scenesToday(handles: string[]): Promise<number> {
  const today = dayStamp();
  return (await listScenes(handles)).filter((x) => x.day === today).length;
}
