import { NextResponse } from "next/server";
import { getCardBySlug } from "@/lib/db/cards";
import { db } from "@/lib/db/client";
import { getSetting } from "@/lib/settings";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

/**
 * "Try Magic Portraits": records the tap server-side (crediting the sender from the card, so the
 * sender's email never reaches the recipient's browser), then redirects with the UTM tags.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const base = await getSetting("links.main_site_url");
  const card = await getCardBySlug((await ctx.params).slug);
  const target = new URL(base);
  target.searchParams.set("utm_source", "greetingcard");
  target.searchParams.set("utm_medium", "referral");
  if (card) {
    const via = new URL(req.url).searchParams.get("via") === "email" ? "email" : "page";
    const theme = card.theme_id ? ((await db().from("themes").select("slug").eq("id", card.theme_id).single()).data as { slug: string } | null) : null;
    target.searchParams.set("utm_campaign", theme?.slug ?? "card");
    target.searchParams.set("card", card.public_id);
    await track("card_recipient_cta_tapped", { card_id: card.public_id, via }, { email: card.sender_email, actor: "recipient", ref: { type: "card", id: card.public_id } });
  }
  return NextResponse.redirect(target, 302);
}
