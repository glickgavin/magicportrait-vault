import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { publishTemplate, templatePublishSchema } from "@/lib/shop/admin";

export const dynamic = "force-dynamic";

/** Settings › Shop › template editor: Publish writes the product's mmp_shop.template in Shopify. */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = templatePublishSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: p.error.issues[0] ? `${p.error.issues[0].path.join(".")}: ${p.error.issues[0].message}` : "invalid" }, 400);
  const r = await publishTemplate(u, p.data);
  return r.ok ? json({ ok: true }) : json({ error: r.error }, r.status);
}
