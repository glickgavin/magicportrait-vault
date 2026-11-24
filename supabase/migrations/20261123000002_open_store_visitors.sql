-- The open store (docs/open-store.md › Visitors and saved data): visitors, their photos and their pictures,
-- and the private store-uploads bucket. Additive: nothing existing is altered.
-- RLS on, no policies, as everywhere: only server code (service role) reads or writes.

-- ---------------------------------------------------------------- visitors
create table public.store_visitors (
  id uuid primary key default gen_random_uuid(),
  -- HMAC(VISITOR_SECRET, cookie token): the cookie alone can act as the visitor, never the id.
  token_hash text not null unique,
  email text check (email is null or email = lower(trim(email))),
  linked_via text check (linked_via in ('sign_in','order','email_link')),
  email_given text check (email_given is null or email_given = lower(trim(email_given))),
  email_given_at timestamptz,
  marketing_consent_at timestamptz,
  first_touch jsonb,
  posthog_distinct_id text,
  shopify_cart_id text,
  shopify_checkout_url text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((email is null) = (linked_via is null))
);
create index store_visitors_email_idx on public.store_visitors (email) where email is not null;
create index store_visitors_email_given_idx on public.store_visitors (email_given) where email_given is not null;
create trigger store_visitors_updated_at before update on public.store_visitors for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- photos
create table public.store_photos (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.store_visitors (id) on delete cascade,
  storage_path text not null,
  width int not null check (width > 0),
  height int not null check (height > 0),
  created_at timestamptz not null default now()
);
create index store_photos_visitor_idx on public.store_photos (visitor_id, created_at desc);

-- ---------------------------------------------------------------- generations (pictures)
create table public.store_generations (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.store_visitors (id) on delete cascade,
  product_id text not null,
  theme text not null,
  photo_ids uuid[] not null default '{}',
  -- Private: never in analytics, Klaviyo or logs.
  names text[] not null default '{}',
  imagen_session_id text,
  status text not null default 'pending' check (status in ('pending','preprocessing','generating','done','failed','timed_out')),
  -- Per result: Imagen's image id, url, width, height and our storage_path.
  images jsonb not null default '[]'::jsonb,
  chosen_index int not null default 0 check (chosen_index >= 0),
  cost_usd numeric(10,4),
  ip_hash text,
  order_id text,
  ordered_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index store_generations_visitor_idx on public.store_generations (visitor_id, created_at desc);
create index store_generations_day_idx on public.store_generations (created_at) where status <> 'failed' and status <> 'timed_out';
create index store_generations_ip_idx on public.store_generations (ip_hash, created_at) where ip_hash is not null;
create index store_generations_session_idx on public.store_generations (imagen_session_id) where imagen_session_id is not null;

-- ---------------------------------------------------------------- RLS: on, no policies
do $$
declare t text;
begin
  foreach t in array array['store_visitors','store_photos','store_generations']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- storage: private uploads
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('store-uploads', 'store-uploads', false, 26214400, array['image/jpeg','image/png'])
on conflict (id) do nothing;
