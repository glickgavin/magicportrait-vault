import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { copySettings, copySettingsSchema } from "@/lib/shop/copy";

export const dynamic = "force-dynamic";

/** Settings › Shop › one product › Copy settings from… (CLAUDE.md allowed write 5: `mmp_shop` fields only). */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = copySettingsSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: p.error.issues[0]?.message ?? "invalid" }, 400);
  const r = await copySettings(u, p.data);
  return r.ok ? json({ ok: true, copied: r.copied, skipped: r.skipped }) : json({ error: r.error }, r.status);
}
