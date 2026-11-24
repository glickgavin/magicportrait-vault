-- The personalisation layer's art library (docs/shop.md › Personalisation layer): pictures and SVGs a super user
-- uploads once in the template editor and reuses on any product (each product offers at most 3). The files are in the
-- public theme-assets bucket under layer-art/ (they aren't private: the store shows them). Additive.
create table public.layer_art (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('png','svg')),
  -- The PNG every canvas draws (an SVG is turned into one when it's uploaded), and the cleaned SVG text, kept here
  -- rather than in the bucket (the bucket serves only raster pictures).
  storage_path text not null,
  svg text check (svg is null or octet_length(svg) <= 1048576),
  width int not null check (width > 0),
  height int not null check (height > 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index layer_art_live_idx on public.layer_art (created_at desc) where archived_at is null;
alter table public.layer_art enable row level security;
revoke all on public.layer_art from anon, authenticated;
