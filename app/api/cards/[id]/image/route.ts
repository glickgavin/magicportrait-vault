import sharp from "sharp";
import { getSessionUser } from "@/lib/auth/session";
import { getCardById, getOwnedCard } from "@/lib/db/cards";
import { getObject } from "@/lib/storage";
import { downloadName } from "@/lib/cards/names";

export const dynamic = "force-dynamic";

/** The card JPEG for its sender (or a super user). `size=thumb` for lists, `download=1` to save. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Not found", { status: 404 });
  const id = (await ctx.params).id;
  const card = user.isSuperUser ? await getCardById(id) : await getOwnedCard(user.email, id);
  if (!card?.jpeg_path) return new Response("Not found", { status: 404 });
  const jpeg = await getObject("cards", card.jpeg_path);
  if (!jpeg) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const thumb = url.searchParams.get("size") === "thumb";
  const body = thumb ? await sharp(jpeg).resize({ width: 300 }).jpeg({ quality: 80 }).toBuffer() : jpeg;
  const headers: Record<string, string> = { "content-type": "image/jpeg", "cache-control": "private, max-age=300", "x-robots-tag": "noindex" };
  if (url.searchParams.get("download") === "1") headers["content-disposition"] = `attachment; filename="${downloadName(card)}"`;
  return new Response(new Uint8Array(body), { headers });
}
