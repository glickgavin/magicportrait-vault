import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { storeFieldsSchema, updateStoreFields } from "@/lib/open-store/admin";

export const dynamic = "force-dynamic";

/** Settings › Shop › one product: its shared and Magic Store fields (CLAUDE.md allowed write 5). */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = storeFieldsSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) {
    const i = p.error.issues[0];
    return json({ error: i ? `${i.path.map(String).join(".") || "input"}: ${i.message}` : "invalid" }, 400);
  }
  const r = await updateStoreFields(u, p.data);
  return r.ok ? json({ ok: true }) : json({ error: r.error }, r.status);
}
