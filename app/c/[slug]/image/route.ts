import { publicCard } from "@/lib/cards/public";
import { getObject } from "@/lib/storage";
import { downloadName } from "@/lib/cards/names";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

/** The card image for whoever holds the share link. Hidden cards are gone. Saving is recorded. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const card = await publicCard((await ctx.params).slug);
  if (!card || card.share_hidden || !card.jpeg_path) return new Response("Not found", { status: 404 });
  const jpeg = await getObject("cards", card.jpeg_path);
  if (!jpeg) return new Response("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  if (download) await track("card_recipient_saved", { card_id: card.public_id }, { email: card.sender_email, actor: "recipient", ref: { type: "card", id: card.public_id } });
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
      ...(download ? { "content-disposition": `attachment; filename="${downloadName(card)}"` } : {}),
    },
  });
}
