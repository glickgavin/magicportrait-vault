import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { hashKey, json, rateLimit } from "@/lib/auth/http";
import { isBrowserBusinessEvent } from "@/lib/events";
import { getOwnedCard } from "@/lib/db/cards";
import { db } from "@/lib/db/client";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

const body = z.object({
  event: z.string().max(64),
  props: z.record(z.string().max(64), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).default({}),
});

const DELIVERY: Record<string, "share" | "download" | "link_copy"> = { card_shared: "share", card_downloaded: "download", card_link_copied: "link_copy" };
const CHANNELS = ["whatsapp", "messages", "facebook", "instagram", "native"];

/**
 * Business events that happen in the browser. The name must be on the allow-list; the email comes
 * from the session, never from the request.
 */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isBrowserBusinessEvent(parsed.data.event)) return json({ error: "unknown_event" }, 400);
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 204 });
  if (!(await rateLimit(`track:${hashKey(user.email)}`, 600))) return json({ error: "rate_limited" }, 429);
  const { event } = parsed.data;
  const props = { ...parsed.data.props };

  let ref: { type: "card"; id: string } | null = null;
  if (typeof props.card_id === "string") {
    const card = await getOwnedCard(user.email, props.card_id);
    if (!card) return json({ error: "not_found" }, 404);
    ref = { type: "card", id: card.public_id };
    props.card_id = card.public_id;
    const type = DELIVERY[event];
    if (type) {
      const channel = typeof props.channel === "string" && CHANNELS.includes(props.channel) ? props.channel : null;
      await db().from("card_deliveries").insert({ card_id: card.id, type, channel, status: "done" });
    }
  }
  await track(event, props, { email: user.email, ref });
  return json({ ok: true });
}
