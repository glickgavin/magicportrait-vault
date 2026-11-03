import { z } from "zod";
import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { searchCustomers } from "@/lib/admin/customers";

export const dynamic = "force-dynamic";

/** Customer search: the query travels in the body, never the URL. */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = z.object({ q: z.string().trim().min(2).max(120) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ results: [] });
  const rows = await searchCustomers(p.data.q);
  return json({ results: rows.map((r) => ({ id: r.id, email: r.email, name: r.display_name, isCustomer: r.is_customer, lastSeen: r.last_seen_at, createdVia: r.created_via })) });
}
