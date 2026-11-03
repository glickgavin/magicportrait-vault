import { adminOr404 } from "@/lib/admin/guard";
import { cardFilters, cardsCsv } from "@/lib/admin/cards";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** CSV export of the current filters (posted as a form, so the search never sits in a URL). */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const form = await req.formData().catch(() => null);
  const f = cardFilters.safeParse(Object.fromEntries(form?.entries() ?? []));
  if (!f.success) return new Response("Bad filters", { status: 400 });
  const { csv } = await cardsCsv(f.data, u.email);
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="cards-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}
