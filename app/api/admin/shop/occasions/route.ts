import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { occasionsUpdateSchema, updateOccasions } from "@/lib/shop/admin";

export const dynamic = "force-dynamic";

/** Settings › Shop › Occasions: the list, in order, kept as the mmp_shop.occasions definition's choices. */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = occasionsUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: p.error.issues[0]?.message ?? "invalid" }, 400);
  const r = await updateOccasions(u, p.data.occasions);
  return r.ok ? json({ ok: true }) : json({ error: r.error, inUse: r.inUse ?? [] }, r.status);
}
