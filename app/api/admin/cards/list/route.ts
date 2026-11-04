import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { cardFilters, listAdminCards, PAGE_SIZE } from "@/lib/admin/cards";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const f = cardFilters.safeParse(await req.json().catch(() => ({})));
  if (!f.success) return json({ error: "invalid" }, 400);
  const r = await listAdminCards(f.data);
  return json({ ...r, pageSize: PAGE_SIZE });
}
