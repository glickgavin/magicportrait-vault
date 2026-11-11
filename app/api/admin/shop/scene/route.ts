import { adminOr404, actorOf } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { getSettings } from "@/lib/settings";
import { getCatalog } from "@/lib/shop";
import { parseTemplate } from "@/lib/shop/template";
import { deleteScene, makeScene, scenesToday, sceneKey, type SceneRefusal } from "@/lib/shop/scenes";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MESSAGES: Record<SceneRefusal | "limit" | "no_preset" | "no_product" | "no_picture" | "too_large" | "shopify", string> = {
  no_credit: "AI Gateway turned this down for lack of credit. Top up the team's AI Gateway credit in Vercel, then try again.",
  not_authorised: "AI Gateway didn't accept this deployment. Check that OIDC is on for the project in Vercel.",
  busy: "The image model is busy. Try again in a minute.",
  no_image: "The model answered without a photo. Try again, or reword the scene.",
  timeout: "The model took too long. Try again.",
  failed: "The model couldn't make this one. Try again.",
  limit: "Today's limit for room photos is used up (shop.scene_daily_limit).",
  no_preset: "That scene isn't in shop.scene_presets.",
  no_product: "That scene's product isn't in the Store collection, or has no description in shop.scene_products.",
  no_picture: "Choose a picture (JPEG, PNG or WebP).",
  too_large: "That picture is too big to send.",
  shopify: "Couldn't read Shopify just now. Try again in a minute.",
};

/** Settings › Shop › Room photos: makes one photo (multipart: presetId, picture, pictureName, note). */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const s = await getSettings(["shop.scene_presets", "shop.scene_products", "shop.scene_daily_limit", "shop.scene_model", "shop.template_upload_max_mb"] as const);
  const max = s["shop.template_upload_max_mb"] * 1024 * 1024;
  if (Number(req.headers.get("content-length") ?? 0) > max + 64 * 1024) return json({ error: MESSAGES.too_large }, 413);
  const form = await req.formData().catch(() => null);
  const preset = s["shop.scene_presets"].find((p) => p.id === String(form?.get("presetId") ?? ""));
  if (!preset) return json({ error: MESSAGES.no_preset }, 404);
  const product = s["shop.scene_products"].find((p) => p.handle === preset.product);
  const file = form?.get("picture");
  if (!file || typeof file === "string" || !/^image\/(jpeg|png|webp)$/.test(file.type)) return json({ error: MESSAGES.no_picture }, 400);
  if (file.size > max) return json({ error: MESSAGES.too_large }, 413);

  const handles = s["shop.scene_presets"].map((p) => p.product);
  if ((await scenesToday(handles)) >= s["shop.scene_daily_limit"]) return json({ error: MESSAGES.limit }, 429);

  let entries;
  try {
    entries = await getCatalog();
  } catch {
    return json({ error: MESSAGES.shopify }, 502);
  }
  const entry = entries.find((e) => e.product.handle === preset.product);
  if (!entry || !product) return json({ error: MESSAGES.no_product }, 404);

  // The product's blank studio photo (its template background), else its first Shopify photo.
  const refUrl = parseTemplate(entry.product.template?.value)?.background.url ?? entry.product.media[0]?.url ?? null;
  let productPhoto: Buffer | null = null;
  if (refUrl && /^https:\/\/cdn\.shopify\.com\//.test(refUrl)) {
    const r = await fetch(refUrl, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (r?.ok) productPhoto = Buffer.from(await r.arrayBuffer());
  }

  const note = typeof form?.get("note") === "string" ? String(form?.get("note")) : undefined;
  const pictureName = String(form?.get("pictureName") ?? file.name ?? "picture");
  const r = await makeScene({ preset, product, productPhoto, picture: Buffer.from(await file.arrayBuffer()), pictureName, note });
  await track(
    "admin_shop_scene_made",
    { product_id: entry.product.legacyId, preset: preset.id, model: s["shop.scene_model"], ok: r.ok, reason: r.ok ? null : r.reason, ms: r.ok ? r.ms : null },
    { email: u.email, actor: actorOf(u) },
  );
  if (!r.ok) return json({ error: MESSAGES[r.reason], detail: r.detail ?? null }, r.reason === "busy" ? 429 : 502);
  return json({ ok: true, scene: r.scene });
}

/** Removes one room photo. JSON: key. */
export async function DELETE(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const b = (await req.json().catch(() => null)) as { key?: unknown } | null;
  const key = typeof b?.key === "string" ? sceneKey(b.key) : null;
  if (!key) return json({ error: "That isn't a room photo." }, 400);
  await deleteScene(key);
  return json({ ok: true });
}
