import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { refreshThemes } from "@/lib/open-store/admin";

export const dynamic = "force-dynamic";

/** Settings › Shop › Magic Store › Refresh themes from Imagen: Imagen's themes into the Shopify dropdown. */
export async function POST() {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const r = await refreshThemes(u);
  return r.ok ? json({ ok: true, themes: r.themes, added: r.added, removed: r.removed }) : json({ error: r.error }, r.status);
}
