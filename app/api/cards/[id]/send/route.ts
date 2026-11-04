import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { json } from "@/lib/auth/http";
import { sendCardNow } from "@/lib/cards/send-now";

export const dynamic = "force-dynamic";

const body = z.object({ email: z.string().max(254) });

/** Ready screen "Send": email this finished card to one recipient now (one recipient per card). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid_email" }, 400);
  const r = await sendCardNow(user.email, (await ctx.params).id, p.data.email);
  return r.ok ? json({ ok: true, resent: r.resent }) : json({ error: r.error }, r.status);
}
