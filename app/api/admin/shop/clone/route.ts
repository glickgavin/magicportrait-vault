import { z } from "zod";
import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { cloneRefSchema, cloneStartSchema, dismissClone, finishClone, startClone } from "@/lib/shop/clone";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const body = z.discriminatedUnion("action", [
  cloneStartSchema.extend({ action: z.literal("start") }),
  cloneRefSchema.extend({ action: z.literal("finish") }),
  cloneRefSchema.extend({ action: z.literal("dismiss") }),
]);

/**
 * Settings › Shop › Clone a product (docs/dreamship.md › Clone a product). `start` makes the Dreamship product
 * (allowed write 8); `finish` adds the new Shopify product to the Magic Store collection (allowed write 9) and
 * fills in its `mmp_shop` fields (allowed write 5); `dismiss` only takes a clone off the list.
 */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: p.error.issues[0]?.message ?? "invalid" }, 400);
  const r = p.data.action === "start" ? await startClone(u, p.data) : p.data.action === "finish" ? await finishClone(u, p.data) : await dismissClone(u, p.data);
  return r.ok ? json(r) : json({ error: r.error }, r.status);
}
