import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { hashKey, json, rateLimit } from "@/lib/auth/http";
import { saveMugChoice } from "@/lib/redeem/service";

export const dynamic = "force-dynamic";

const body = z.object({ tileId: z.string().trim().min(1).max(200) });

export async function POST(req: Request, ctx: { params: Promise<{ orderName: string }> }) {
  const user = await getSessionUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid_tile" }, 422);
  if (!(await rateLimit(`mug:${hashKey(user.email)}`, 30))) return json({ error: "rate_limited" }, 429);
  const r = await saveMugChoice(user.email, decodeURIComponent((await ctx.params).orderName), parsed.data.tileId);
  return r.ok ? json({ ok: true, tileId: r.tileId }) : json({ error: r.error }, r.status);
}
