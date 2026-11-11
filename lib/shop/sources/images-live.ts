import "server-only";
import { pgPool } from "@/lib/sources/pg-live";
import type { MirrorImageProps, MirrorTileUpload, ShopImagesSource } from "./images";

/** The mirror's shared pool on the read-only vault_reader role (MIRROR_DATABASE_URL), see lib/sources/pg-live.ts. */
const sqlFor = (url: string) => pgPool(url);

const UUID_RE = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

export class ShopImagesLive implements ShopImagesSource {
  readonly kind = "live" as const;
  constructor(private url: string) {}

  // docs/data.md §2.4: `email = any($1)` uses the email index; no lower(), no `?` on properties.
  async pastUploads(emails: string[], p: MirrorImageProps) {
    const sql = sqlFor(this.url);
    const rows = await sql<{ url: string; created_at: Date }[]>`
      select m.properties->>${p.uploadProperty} as url, max(m.created_at) as created_at
      from public.analytics_events_mirror m
      where m.email = any (${emails}::text[])
        and m.event_name = ${p.uploadEvent}
        and (m.properties->>${p.uploadProperty}) like 'https://%'
      group by 1
      order by 2 desc
      limit ${p.limit}`;
    return rows.map((r) => ({ url: r.url, createdAt: new Date(r.created_at).toISOString() }));
  }

  async photoTileUploads(emails: string[], p: MirrorImageProps): Promise<MirrorTileUpload[]> {
    const sql = sqlFor(this.url);
    const rows = await sql<{ tile_id: string; created_at: Date }[]>`
      select m.properties->>'tile_id' as tile_id, max(m.created_at) as created_at
      from public.analytics_events_mirror m
      where m.email = any (${emails}::text[])
        and m.event_name = ${p.tileEvent}
        and m.properties->>'tile_type' = 'photo'
        and (m.properties->>'tile_id') ~* ${UUID_RE}
      group by 1
      order by 2 desc
      limit ${p.limit}`;
    return rows.map((r) => ({ tileId: r.tile_id, createdAt: new Date(r.created_at).toISOString() }));
  }
}
