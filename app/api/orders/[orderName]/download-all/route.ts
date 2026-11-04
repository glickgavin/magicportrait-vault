import { getSessionUser } from "@/lib/auth/session";
import { json } from "@/lib/auth/http";
import { downloadAll } from "@/lib/redeem/downloads";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(_req: Request, ctx: { params: Promise<{ orderName: string }> }) {
  const user = await getSessionUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  return downloadAll(user.email, decodeURIComponent((await ctx.params).orderName));
}
