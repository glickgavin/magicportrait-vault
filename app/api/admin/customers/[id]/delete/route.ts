import { z } from "zod";
import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { getMemberById } from "@/lib/db/members";
import { deleteCustomer } from "@/lib/admin/customers";

export const dynamic = "force-dynamic";

/** Delete on request. The body must repeat the person's email as confirmation. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const m = await getMemberById((await ctx.params).id);
  if (!m) return json({ error: "not_found" }, 404);
  const p = z.object({ confirm: z.string() }).safeParse(await req.json().catch(() => null));
  if (!p.success || p.data.confirm.trim().toLowerCase() !== m.email) return json({ error: "Type the person's email to confirm." }, 400);
  return json({ ok: true, ...(await deleteCustomer(m.email, u.email)) });
}
