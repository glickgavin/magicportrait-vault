import { getSessionUser } from "@/lib/auth/session";
import { json } from "@/lib/auth/http";
import { downloadOne } from "@/lib/redeem/downloads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ orderName: string; n: string }> }) {
  const user = await getSessionUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const { orderName, n } = await ctx.params;
  const i = Number(n);
  if (!Number.isInteger(i) || i < 1 || i > 1000) return json({ error: "not_found" }, 404);
  return downloadOne(user.email, decodeURIComponent(orderName), i);
}
