import { z } from "zod";
import { clientIp, hashKey, json, rateLimit } from "@/lib/auth/http";
import { isBotRequest } from "@/lib/open-store/bot";
import { generationView, startGeneration, type PhotoInput } from "@/lib/open-store/pictures";
import { ensureVisitor } from "@/lib/open-store/visitor";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const MAX_SLOTS = 4;
const fields = z.object({
  product: z.string().regex(/^\d{1,20}$/),
  names: z.array(z.string().max(60)).max(MAX_SLOTS),
});

/**
 * Create a picture (docs/open-store.md › Creating the picture): multipart `product`, `photo0…` (files) or
 * `photoId0…` (photos added before), `name0…`. Hidden store: proxy.ts answers 404 first.
 */
export async function POST(req: Request) {
  if (await isBotRequest()) return json({ error: "bot" }, 403);
  const ip = await clientIp(req);
  const s = await getSettings(["open_store.generations_per_ip_per_day", "shop.upload_max_mb"] as const);
  // Requests (refused ones too) per IP per hour, so bad uploads can't be hammered in.
  if (!(await rateLimit(`store-gen-ip:${hashKey(ip)}`, Math.max(60, s["open_store.generations_per_ip_per_day"] * 4)))) return json({ error: "rate_limited" }, 429);
  const max = s["shop.upload_max_mb"] * 1024 * 1024;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_SLOTS * max + 64 * 1024) return json({ error: "too_large" }, 413);
  const form = await req.formData().catch(() => null);
  if (!form) return json({ error: "invalid" }, 400);
  const names: string[] = [];
  const photos: PhotoInput[] = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const name = form.get(`name${i}`);
    names.push(typeof name === "string" ? name : "");
    const file = form.get(`photo${i}`);
    const photoId = form.get(`photoId${i}`);
    if (file && typeof file !== "string") {
      if (file.size > max) return json({ error: "photo_refused", slot: i, reason: "too_large" }, 422);
      photos.push({ file: Buffer.from(await file.arrayBuffer()) });
    } else if (typeof photoId === "string" && /^p_[0-9a-f-]{36}$/.test(photoId)) {
      photos.push({ photoId: photoId.slice(2) });
    } else break;
  }
  const p = fields.safeParse({ product: form.get("product"), names });
  if (!p.success) return json({ error: "invalid" }, 400);
  const visitor = await ensureVisitor();
  const r = await startGeneration({ visitor, productLegacyId: p.data.product, photos, names: p.data.names, ip });
  if ("error" in r) {
    const status = r.error === "not_in_store" ? 404 : r.error === "limit_visitor" || r.error === "limit_ip" ? 429 : r.error === "busy" || r.error === "imagen_unavailable" ? 503 : 422;
    return json(r, status);
  }
  return json({ ok: true, generation: await generationView(r.generation) });
}
