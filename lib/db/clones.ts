import "server-only";
import { db } from "./client";

export type CloneEvent = { event: string; at: string; props: Record<string, unknown>; actor: string };

/** The clone screen's events (started, finished, dismissed) since `since`, oldest first: the record of each clone. */
export async function cloneEvents(since: Date): Promise<CloneEvent[]> {
  const r = await db().from("activity_log").select("event, occurred_at, props, actor").in("event", ["admin_product_clone_started", "admin_product_clone_finished", "admin_product_clone_dismissed"]).gte("occurred_at", since.toISOString()).order("occurred_at", { ascending: true }).limit(2000);
  return ((r.data ?? []) as { event: string; occurred_at: string; props: Record<string, unknown> | null; actor: string }[]).map((x) => ({ event: x.event, at: x.occurred_at, props: x.props ?? {}, actor: x.actor }));
}
