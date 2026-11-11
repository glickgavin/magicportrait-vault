import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { productUpdateSchema, updateProductFields } from "@/lib/shop/admin";

export const dynamic = "force-dynamic";

/** Settings › Shop › Products: one product's page and occasions, written to its mmp_shop metafields. */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = productUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: p.error.issues[0]?.message ?? "invalid" }, 400);
  const r = await updateProductFields(u, p.data);
  return r.ok ? json({ ok: true }) : json({ error: r.error }, r.status);
}
