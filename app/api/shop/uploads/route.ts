import { clientIp, hashKey, json, notFoundJson, rateLimit } from "@/lib/auth/http";
import { getSettings } from "@/lib/settings";
import { shopUserOrNull } from "@/lib/shop";
import { pictureLink, saveUpload } from "@/lib/shop/pictures";

export const dynamic = "force-dynamic";

/** A new photo for the shop: multipart field `file`. Checked by content, cleaned, kept private. */
export async function POST(req: Request) {
  const u = await shopUserOrNull();
  if (!u) return notFoundJson();
  const s = await getSettings(["shop.upload_rate_limit_per_hour", "shop.upload_max_mb"] as const);
  const [okEmail, okIp] = await Promise.all([rateLimit(`shop-upload:${hashKey(u.email)}`, s["shop.upload_rate_limit_per_hour"]), rateLimit(`shop-upload-ip:${hashKey(await clientIp(req))}`, s["shop.upload_rate_limit_per_hour"] * 3)]);
  if (!okEmail || !okIp) return json({ error: "rate_limited" }, 429);
  const max = s["shop.upload_max_mb"] * 1024 * 1024;
  if (Number(req.headers.get("content-length") ?? 0) > max + 64 * 1024) return json({ error: "too_large" }, 413);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return json({ error: "no_file" }, 400);
  if (file.size > max) return json({ error: "too_large" }, 413);
  const r = await saveUpload(u.email, Buffer.from(await file.arrayBuffer()));
  if (!r.ok) return json({ error: r.reason }, 422);
  return json({ ok: true, picture: { id: r.image.id, kind: r.image.kind, url: await pictureLink(r.image), width: r.image.width, height: r.image.height } });
}
