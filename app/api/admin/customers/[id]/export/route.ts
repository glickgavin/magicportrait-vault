import { adminOr404 } from "@/lib/admin/guard";
import { getMemberById } from "@/lib/db/members";
import { exportCustomer } from "@/lib/admin/customers";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const m = await getMemberById((await ctx.params).id);
  if (!m) return new Response("Not found", { status: 404 });
  const data = await exportCustomer(m.email, u.email);
  return new Response(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="my-magic-portraits-export-${m.id}.json"`, "cache-control": "no-store" } });
}
