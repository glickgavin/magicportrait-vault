import { z } from "zod";
import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { getSources } from "@/lib/sources";
import { viewOrder } from "@/lib/redeem/service";

export const dynamic = "force-dynamic";

const body = z.object({ order: z.string().trim().regex(/^#?[A-Za-z0-9-]{1,30}$/) });

/** Read-only: what the customer would see for an order. No emails or other personal details. */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "Enter an order number." }, 400);
  const { shopify } = await getSources();
  const ref = /^\d{10,}$/.test(p.data.order) ? { id: p.data.order } : await shopify.resolveOrderByName(p.data.order).catch(() => null);
  const order = ref ? await shopify.orderById(ref.id).catch(() => null) : null;
  if (!order) return json({ error: "No such order." }, 404);
  const v = await viewOrder(order);
  return json({
    order: order.name,
    createdAt: order.createdAt,
    financialStatus: order.financialStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    cancelled: Boolean(order.cancelledAt),
    portraits: v.parsed.portraits.map((p, i) => ({ n: i + 1, tileId: p.tileId, theme: p.theme, type: p.tileType })),
    mug: { present: v.parsed.mug.present, currentTileId: v.parsed.mug.currentTileId, locked: v.lock.locked, lockReason: v.lock.reason, editable: v.mugEditable },
    downloads: { enabled: v.downloadsEnabled, count: v.chips.downloads },
    chips: v.chips,
  });
}
