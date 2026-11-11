import "server-only";
import postgres from "postgres";
import type { ImagenPortraitRow, ImagenSource, MirrorSession, MirrorSource, MugJob } from "./types";

const pools = new Map<string, ReturnType<typeof postgres>>();

/**
 * One small pool per database URL, shared by everything that reads that database (the shop's picture
 * lists too). Transaction pooler: no prepared statements. Read-only role. Connections stay open for a
 * minute between uses, so a person moving between pages doesn't wait for a new one (the mirror is in
 * us-west-1, a new connection there costs several round trips).
 */
export function pgPool(url: string) {
  return pool(url);
}

function pool(url: string) {
  let p = pools.get(url);
  if (!p) {
    p = postgres(url, { max: 4, idle_timeout: 60, connect_timeout: 10, prepare: false, ssl: "require", connection: { application_name: "magic-vault" } });
    pools.set(url, p);
  }
  return p;
}

const UUID_RE = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

export class MirrorLive implements MirrorSource {
  readonly kind = "live" as const;
  constructor(
    private url: string,
    private props: { session: string; lptemp: string },
  ) {}

  async sessionsForEmail(candidates: string[], opts?: { expandByBrowserSession?: boolean }): Promise<MirrorSession[]> {
    const sql = pool(this.url);
    const { session, lptemp } = this.props;
    // docs/data.md §2.4: exact predicate shape matters for the index (no lower(), no `?`).
    const rows = await sql<{ imagen_session_id: string; lptemp_session_id: string | null; first_seen_at: Date; last_seen_at: Date }[]>`
      select m.properties->>${session} as imagen_session_id,
             (array_agg(m.properties->>${lptemp} order by m.created_at desc)
                filter (where m.properties->>${lptemp} is not null))[1] as lptemp_session_id,
             min(m.created_at) as first_seen_at,
             max(m.created_at) as last_seen_at
      from public.analytics_events_mirror m
      where m.email = any (${candidates}::text[])
        and (m.properties->>${session}) ~ ${UUID_RE}
      group by 1
      order by max(m.created_at) desc`;
    const out: MirrorSession[] = rows.map((r) => ({
      imagenSessionId: r.imagen_session_id,
      lptempSessionId: r.lptemp_session_id,
      firstSeenAt: new Date(r.first_seen_at).toISOString(),
      lastSeenAt: new Date(r.last_seen_at).toISOString(),
    }));
    if (opts?.expandByBrowserSession) {
      const extra = await sql<{ imagen_session_id: string }[]>`
        with mine as (
          select distinct session_id from public.analytics_events_mirror
          where email = any (${candidates}::text[]) and session_id is not null
        )
        select distinct m.properties->>${session} as imagen_session_id
        from public.analytics_events_mirror m join mine using (session_id)
        where (m.properties->>${session}) ~ ${UUID_RE}`;
      const have = new Set(out.map((s) => s.imagenSessionId));
      for (const r of extra) if (!have.has(r.imagen_session_id)) out.push({ imagenSessionId: r.imagen_session_id, lptempSessionId: null, firstSeenAt: new Date(0).toISOString(), lastSeenAt: new Date(0).toISOString() });
    }
    return out;
  }

  async mugJobs(orderLegacyId: string): Promise<MugJob[]> {
    const sql = pool(this.url);
    const rows = await sql<
      { shopify_line_item_id: string; tile_id: string | null; state: string; gelato_order_id: string | null; shopify_fulfillment_id: string | null; mug_ready: boolean; manual_approval: string | null; tracking_url: string | null; updated_at: Date }[]
    >`select shopify_line_item_id, tile_id, state, gelato_order_id, shopify_fulfillment_id, mug_ready, manual_approval, tracking_url, updated_at
      from public.mug_fulfillment_jobs where shopify_order_id = ${orderLegacyId}`;
    return rows.map((r) => ({
      shopifyLineItemId: r.shopify_line_item_id,
      tileId: r.tile_id,
      state: r.state,
      gelatoOrderId: r.gelato_order_id,
      shopifyFulfillmentId: r.shopify_fulfillment_id,
      mugReady: r.mug_ready,
      manualApproval: r.manual_approval,
      trackingUrl: r.tracking_url,
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  async ping() {
    const sql = pool(this.url);
    const r = await sql<{ n: number }[]>`select count(*)::int as n from (select 1 from public.analytics_events_mirror order by created_at desc limit 10) x`;
    return { rows: r[0]?.n ?? 0 };
  }
}

export class ImagenLive implements ImagenSource {
  readonly kind = "live" as const;
  constructor(private url: string) {}

  async portraits(sessionIds: string[], opts: { includeChildren: boolean; imageBaseUrl: string; newestSessions?: number }): Promise<ImagenPortraitRow[]> {
    if (!sessionIds.length) return [];
    // LIMIT NULL is no limit.
    const newest = opts.newestSessions && opts.newestSessions > 0 ? opts.newestSessions : null;
    const sql = pool(this.url);
    // docs/data.md §3.6
    const rows = await sql<
      {
        image_id: string;
        session_id: string;
        session_created_at: Date;
        session_status: string;
        is_recommendation_child: boolean;
        parent_session_id: string | null;
        pet_name: string | null;
        theme_id: string | null;
        theme_name: string | null;
        theme_slug: string | null;
        created_at: Date;
        tile_index: number | null;
        width: number | null;
        height: number | null;
        format: string | null;
        image_path: string;
        ordered: boolean;
        shopify_order_ids: string[] | null;
        shopify_line_item_ids: string[] | null;
        first_ordered_at: Date | null;
      }[]
    >`
      with input as (select unnest(${sessionIds}::uuid[]) as id),
      all_sessions as (
        select id from input
        union
        select sr.child_session_id from public.session_recommendations sr
        join input on sr.session_id = input.id
        where ${opts.includeChildren} and sr.child_session_id is not null
      ),
      picked as (
        select a.id from all_sessions a
        join public.sessions s on s.id = a.id
        where coalesce((s.metadata->>'is_test')::boolean, false) = false
          and exists (select 1 from public.images i where i.session_id = a.id and i.is_grid = false and i.visibility = 'customer')
        order by s.created_at desc
        limit ${newest}
      )
      select i.id as image_id, i.session_id, s.created_at as session_created_at, s.status as session_status,
             coalesce((s.metadata->>'is_recommendation_child')::boolean, false) as is_recommendation_child,
             s.metadata->>'parent_session_id' as parent_session_id,
             s.name as pet_name, s.theme_id, t.name as theme_name, t.slug as theme_slug,
             i.created_at, i.tile_index, i.width, i.height, i.format, i.image_path,
             (r.image_id is not null) as ordered, r.shopify_order_ids, r.shopify_line_item_ids, r.first_ordered_at
      from public.images i
      join picked a on a.id = i.session_id
      join public.sessions s on s.id = i.session_id
      left join public.themes t on t.id = s.theme_id
      left join lateral (
        select re.image_id, array_agg(distinct re.shopify_order_id) as shopify_order_ids,
               array_agg(distinct re.shopify_line_item_id) as shopify_line_item_ids, min(re.occurred_at) as first_ordered_at
        from public.revenue_events re where re.image_id = i.id and re.source = 'shopify' group by re.image_id
      ) r on true
      where i.is_grid = false and i.visibility = 'customer'
        and coalesce((s.metadata->>'is_test')::boolean, false) = false
      order by i.created_at desc, i.session_id, i.tile_index nulls first`;
    return rows.map((r) => ({
      imageId: r.image_id,
      sessionId: r.session_id,
      sessionCreatedAt: new Date(r.session_created_at).toISOString(),
      sessionStatus: r.session_status,
      isRecommendationChild: r.is_recommendation_child,
      parentSessionId: r.parent_session_id,
      petName: r.pet_name,
      themeId: r.theme_id,
      themeName: r.theme_name,
      themeSlug: r.theme_slug,
      createdAt: new Date(r.created_at).toISOString(),
      tileIndex: r.tile_index,
      width: r.width,
      height: r.height,
      format: r.format,
      imagePath: r.image_path,
      imageUrl: opts.imageBaseUrl + r.image_path,
      ordered: r.ordered,
      shopifyOrderIds: r.shopify_order_ids ?? [],
      shopifyLineItemIds: r.shopify_line_item_ids ?? [],
      firstOrderedAt: r.first_ordered_at ? new Date(r.first_ordered_at).toISOString() : null,
    }));
  }

  async portraitTotals(sessionIds: string[], opts: { includeChildren: boolean }) {
    if (!sessionIds.length) return { sessions: 0, portraits: 0, ordered: 0 };
    const sql = pool(this.url);
    // The same pictures as portraits() counts (customer-visible, not grids, not test sessions).
    const r = await sql<{ sessions: number; portraits: number; ordered: number }[]>`
      with input as (select unnest(${sessionIds}::uuid[]) as id),
      all_sessions as (
        select id from input
        union
        select sr.child_session_id from public.session_recommendations sr
        join input on sr.session_id = input.id
        where ${opts.includeChildren} and sr.child_session_id is not null
      ),
      visible as (
        select i.id, i.session_id from public.images i
        join all_sessions a on a.id = i.session_id
        join public.sessions s on s.id = i.session_id
        where i.is_grid = false and i.visibility = 'customer' and coalesce((s.metadata->>'is_test')::boolean, false) = false
      )
      select (select count(distinct session_id) from visible)::int as sessions,
             (select count(*) from visible)::int as portraits,
             (select count(distinct re.image_id) from public.revenue_events re join visible v on v.id = re.image_id where re.source = 'shopify')::int as ordered`;
    return r[0] ?? { sessions: 0, portraits: 0, ordered: 0 };
  }

  async sessions(sessionIds: string[]) {
    if (!sessionIds.length) return [];
    const sql = pool(this.url);
    const rows = await sql<{ id: string; created_at: Date; status: string; pet_name: string | null; theme_name: string | null }[]>`
      select s.id, s.created_at, s.status, s.name as pet_name, t.name as theme_name
      from public.sessions s left join public.themes t on t.id = s.theme_id
      where s.id = any (${sessionIds}::uuid[]) order by s.created_at desc`;
    return rows.map((r) => ({ id: r.id, createdAt: new Date(r.created_at).toISOString(), status: r.status, petName: r.pet_name, themeName: r.theme_name }));
  }

  async ping() {
    const sql = pool(this.url);
    const r = await sql<{ n: number }[]>`select count(*)::int as n from (select 1 from public.sessions order by created_at desc limit 10) x`;
    return { rows: r[0]?.n ?? 0 };
  }
}
