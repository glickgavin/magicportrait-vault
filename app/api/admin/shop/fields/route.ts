import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { createMissingFields } from "@/lib/shop/admin";

export const dynamic = "force-dynamic";

/** Settings › Shop: creates the missing mmp_shop metafield definitions in Shopify (never edits existing ones). */
export async function POST() {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const r = await createMissingFields(u);
  return r.ok ? json({ ok: true, created: r.created ?? [], failed: r.failed ?? [] }) : json({ error: r.error }, r.status);
}
