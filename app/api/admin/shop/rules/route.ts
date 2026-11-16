import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { rulesUpdateSchema, updateVariantRules } from "@/lib/shop/admin";

export const dynamic = "force-dynamic";

/** Settings › Shop › Print rules: the mmp_shop rules on one product's sizes (CLAUDE.md allowed write 5). */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = rulesUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) {
    const i = p.error.issues[0];
    return json({ error: i ? `${String(i.path.slice(-1)[0] ?? "input")}: ${i.message}` : "invalid" }, 400);
  }
  const r = await updateVariantRules(u, p.data);
  return r.ok ? json({ ok: true }) : json({ error: r.error }, r.status);
}
