import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { json } from "@/lib/auth/http";
import { lineForFulfilment } from "@/lib/db/shop";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { signedUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * For the fulfilment side only: a fresh signed link to a new upload (and the preview) on a shop line,
 * by `_vault_line_id`. Authorised by `x-shop-signature: HMAC-SHA256(SHOP_FULFILMENT_SECRET, line id)`.
 */
export async function POST(req: Request) {
  const secret = env.optional("SHOP_FULFILMENT_SECRET");
  if (!secret) return new Response("Not found", { status: 404 });
  const p = z.object({ line_id: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  const want = createHmac("sha256", secret).update(p.data.line_id).digest("hex");
  const got = req.headers.get("x-shop-signature") ?? "";
  if (got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return json({ error: "unauthorised" }, 401);
  const found = await lineForFulfilment(p.data.line_id);
  if (!found) return json({ error: "not_found" }, 404);
  const days = (await getSettings(["shop.fulfilment_link_days"] as const))["shop.fulfilment_link_days"];
  const image = found.image.source_url ?? (found.image.storage_path ? await signedUrl("shop-uploads", found.image.storage_path, days * 86_400) : null);
  const preview = found.line.preview_path ? await signedUrl("shop-uploads", found.line.preview_path, days * 86_400) : null;
  return json({ image_url: image, preview_url: preview, valid_days: days });
}
