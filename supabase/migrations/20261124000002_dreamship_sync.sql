-- Dreamship link and sync (docs/dreamship.md › Part A): the last report per linked Shopify product, from the card's
-- "Sync from Dreamship" or the daily report-only run. Nothing here is ever sent to Shopify on its own. Additive.
create table public.dreamship_sync (
  product_id text primary key,             -- Shopify product gid
  legacy_id text not null,
  dreamship_product_id bigint not null,
  report jsonb not null,                   -- lib/dreamship/sync.ts › SyncReport (sizes, proposals, cost, margin, dpi, flags)
  warnings int not null default 0,
  differs int not null default 0,          -- fields that differ from Dreamship
  synced_at timestamptz not null default now(),
  synced_by text not null default 'system' -- an email, or 'cron'
);
alter table public.dreamship_sync enable row level security;
revoke all on public.dreamship_sync from anon, authenticated;
