-- The shop (docs/shop.md): its own tables and bucket. Additive: nothing existing is altered
-- except that the settings table now also allows the `shop` and `site` sections.
-- RLS on, no policies, as everywhere: only server code (service role) reads or writes.

-- ---------------------------------------------------------------- settings sections
alter table public.settings drop constraint if exists settings_section_check;
alter table public.settings add constraint settings_section_check
  check (section in ('cards','gift','redeem','auth','vault','themes','brand','email','links','tracking','klaviyo','shop','site'));

-- ---------------------------------------------------------------- images
-- One row per picture a customer has used in the shop. External pictures (portraits, past uploads,
-- photo tiles) are referenced by URL, never copied; new uploads live in the private shop-uploads bucket.
create table public.shop_images (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null check (owner_email = lower(trim(owner_email))),
  kind text not null check (kind in ('portrait','upload','photo_tile','new_upload')),
  source_url text,
  storage_path text,
  source_ref text,
  width int check (width > 0),
  height int check (height > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'new_upload') = (storage_path is not null)),
  check (kind = 'new_upload' or source_url is not null)
);
create unique index shop_images_owner_source_idx on public.shop_images (owner_email, source_url) where source_url is not null;
create index shop_images_owner_idx on public.shop_images (owner_email, created_at desc);
create trigger shop_images_updated_at before update on public.shop_images for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- carts
create table public.shop_carts (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null check (owner_email = lower(trim(owner_email))),
  status text not null default 'open' check (status in ('open','checked_out','paid','expired')),
  customer_type text not null default 'normal' check (customer_type in ('normal','vip')),
  discount_code text,
  shopify_cart_id text,
  shopify_checkout_url text,
  gift_for text check (char_length(gift_for) <= 120),
  gift_message text check (char_length(gift_message) <= 1000),
  paid_order_id text,
  checked_out_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index shop_carts_one_open_idx on public.shop_carts (owner_email) where status = 'open';
create index shop_carts_shopify_idx on public.shop_carts (shopify_cart_id) where shopify_cart_id is not null;
create trigger shop_carts_updated_at before update on public.shop_carts for each row execute function public.set_updated_at();

create table public.shop_cart_lines (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.shop_carts (id) on delete cascade,
  page text not null check (page in ('gifts','products')),
  product_id text not null,
  variant_id text not null,
  quantity int not null check (quantity between 1 and 100),
  image_id uuid not null references public.shop_images (id),
  crop jsonb,
  rules_version text,
  template_version text,
  shopify_line_id text,
  preview_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shop_cart_lines_cart_idx on public.shop_cart_lines (cart_id, created_at);
create index shop_cart_lines_image_idx on public.shop_cart_lines (image_id);
create trigger shop_cart_lines_updated_at before update on public.shop_cart_lines for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- RLS: on, no policies
do $$
declare t text;
begin
  foreach t in array array['shop_images','shop_carts','shop_cart_lines']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- storage: private uploads
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('shop-uploads', 'shop-uploads', false, 20971520, array['image/jpeg'])
on conflict (id) do nothing;
