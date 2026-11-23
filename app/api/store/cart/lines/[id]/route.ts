import { z } from "zod";
import { json } from "@/lib/auth/http";
import { changeStoreLine, removeStoreLine, storeCartView } from "@/lib/open-store/cart";
import { asker } from "@/lib/open-store/owner";

export const dynamic = "force-dynamic";

const id = z.string().uuid();

/** Change a line's quantity: `{ quantity }`. Only in this visitor's cart (or a linked email's). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const lineId = id.safeParse((await ctx.params).id);
  const body = z.object({ quantity: z.number().int() }).safeParse(await req.json().catch(() => null));
  if (!lineId.success || !body.success) return json({ error: "invalid" }, 400);
  const a = await asker();
  const r = await changeStoreLine(a, lineId.data, body.data.quantity);
  if (!r.ok) return json({ error: r.error }, r.status);
  return json({ ok: true, cart: await storeCartView(a) });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const lineId = id.safeParse((await ctx.params).id);
  if (!lineId.success) return json({ error: "invalid" }, 400);
  const a = await asker();
  const r = await removeStoreLine(a, lineId.data);
  if (!r.ok) return json({ error: r.error }, r.status);
  return json({ ok: true, cart: await storeCartView(a) });
}
