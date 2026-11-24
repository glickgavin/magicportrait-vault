import "server-only";
import { visitorById, type StoreVisitorRow } from "@/lib/db/store";
import { getSettings } from "@/lib/settings";
import { track, type TrackOptions } from "@/lib/track";
import type { EventName } from "@/lib/events";
import { firstTouchSource, type FirstTouch } from "./first-touch";

/**
 * Every server-side open-store event (docs/open-store.md › Analytics and PostHog › Identity):
 * - PostHog: the browser's own PostHog id kept on the visitor row (so the funnel is one person from the first page
 *   view), with `store_visitor_id`, `area`, `preview` and the store's person properties.
 * - activity_log (business events): the proven email when there is one; otherwise email null and
 *   `ref_type` = `store_visitor`, `ref_id` = the visitor id.
 * A typed (unproven) email is never used here.
 */
export async function storeTrack(
  event: EventName,
  props: Record<string, unknown>,
  who: { visitor: StoreVisitorRow | string; email?: string | null; source?: TrackOptions["source"]; actor?: TrackOptions["actor"]; set?: Record<string, unknown>; ref?: TrackOptions["ref"] },
): Promise<void> {
  const visitor = typeof who.visitor === "string" ? await visitorById(who.visitor) : who.visitor;
  const visitorId = typeof who.visitor === "string" ? who.visitor : who.visitor.id;
  const preview = !(await getSettings(["open_store.enabled"] as const))["open_store.enabled"];
  const email = who.email ?? visitor?.email ?? null;
  const ft = (visitor?.first_touch ?? null) as FirstTouch | null;
  await track(
    event,
    { ...props, store_visitor_id: visitorId, area: "open_store", preview },
    {
      ...(email ? { email } : { distinctId: visitor?.posthog_distinct_id || `store:${visitorId}`, ref: { type: "store_visitor" as const, id: visitorId } }),
      ...(who.ref ? { ref: who.ref } : {}),
      source: who.source ?? "vault",
      actor: who.actor ?? "customer",
      person: {
        profile: true,
        setOnce: { store_visitor_id: visitorId, store_first_seen_at: visitor?.created_at ?? null, store_first_touch_source: firstTouchSource(ft) },
        set: who.set,
      },
    },
  );
}
