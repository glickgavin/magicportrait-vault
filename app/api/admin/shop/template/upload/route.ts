import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { getSettings } from "@/lib/settings";
import { getCatalog } from "@/lib/shop";
import { saveTemplateUpload, uploadKeyFor, type TemplateUploadKind } from "@/lib/shop/template-media";
import { parseTemplate } from "@/lib/shop/template";
import { removeObjects } from "@/lib/storage";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  not_an_image: "That file isn't a JPEG, PNG or WebP photo.",
  too_small: "That photo is too small: its short side must be at least 400 px.",
  too_large: "That file is too big to send.",
  overlay_not_see_through: "An overlay must be a PNG or WebP with see-through parts where the picture goes. Upload it as a photo instead if it's the blank product.",
};

/** Settings › Shop › Preview template: a blank product photo or an overlay for one Store product (multipart: productId, kind, file). */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const max = (await getSettings(["shop.template_upload_max_mb"] as const))["shop.template_upload_max_mb"] * 1024 * 1024;
  if (Number(req.headers.get("content-length") ?? 0) > max + 64 * 1024) return json({ error: MESSAGES.too_large }, 413);
  const form = await req.formData().catch(() => null);
  const productId = String(form?.get("productId") ?? "");
  const kind = form?.get("kind") === "overlay" ? "overlay" : form?.get("kind") === "background" ? "background" : null;
  const file = form?.get("file");
  if (!kind || !file || typeof file === "string") return json({ error: "Choose a photo to upload." }, 400);
  if (file.size > max) return json({ error: MESSAGES.too_large }, 413);
  let entries;
  try {
    entries = await getCatalog({ fresh: true });
  } catch {
    return json({ error: "Couldn't read Shopify just now. Try again in a minute." }, 502);
  }
  const entry = entries.find((e) => e.product.id === productId);
  if (!entry) return json({ error: "That product isn't in the Store collection." }, 404);
  const r = await saveTemplateUpload(entry.product.legacyId, kind as TemplateUploadKind, Buffer.from(await file.arrayBuffer()));
  if (!r.ok) return json({ error: MESSAGES[r.reason] ?? "Couldn't use that file." }, 422);
  await track("admin_shop_template_uploaded", { product_id: entry.product.legacyId, kind }, { email: u.email, actor: `super_user:${u.email}` });
  return json({ ok: true, media: r.media });
}

/** Removes a photo uploaded for a product, unless its published template uses it. JSON: productId, mediaId. */
export async function DELETE(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const b = (await req.json().catch(() => null)) as { productId?: unknown; mediaId?: unknown } | null;
  let entries;
  try {
    entries = await getCatalog({ fresh: true });
  } catch {
    return json({ error: "Couldn't read Shopify just now. Try again in a minute." }, 502);
  }
  const entry = entries.find((e) => e.product.id === b?.productId);
  if (!entry) return json({ error: "That product isn't in the Store collection." }, 404);
  const mediaId = typeof b?.mediaId === "string" ? b.mediaId : "";
  const key = uploadKeyFor(entry.product.legacyId, mediaId);
  if (!key) return json({ error: "That isn't a photo uploaded for this product." }, 400);
  const saved = parseTemplate(entry.product.template?.value);
  if (saved && (saved.background.media_id === mediaId || saved.overlay?.media_id === mediaId)) return json({ error: "The published template uses this photo. Publish one without it first." }, 409);
  await removeObjects("theme-assets", [key]);
  return json({ ok: true });
}
