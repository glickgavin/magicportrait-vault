-- My Magic Portraits ("vault"): the app's own tables. docs/schema.md.
-- RLS on every table, deny by default: there are no policies, so only the service role
-- (server code in lib/db) can read or write. The browser never queries tables.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- settings
create table public.settings (
  key text primary key check (key ~ '^[a-z]+\.[a-z0-9_.]+$'),
  value jsonb not null,
  type text not null check (type in ('text','number','boolean','choice','list','json','shopify_id','date')),
  section text not null check (section in ('cards','gift','redeem','auth','vault','themes','brand','email','links','tracking','klaviyo')),
  label text not null,
  description text,
  options jsonb,
  updated_by text check (updated_by = lower(updated_by)),
  updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.settings_history (
  id bigserial primary key,
  key text not null,
  old_value jsonb,
  new_value jsonb,
  changed_by text,
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index settings_history_key_idx on public.settings_history (key, changed_at desc);
create index settings_history_changed_by_idx on public.settings_history (changed_by, changed_at desc);

create or replace function public.settings_write_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into settings_history (key, old_value, new_value, changed_by) values (new.key, null, new.value, coalesce(new.updated_by, 'seed'));
  elsif new.value is distinct from old.value then
    insert into settings_history (key, old_value, new_value, changed_by) values (new.key, old.value, new.value, new.updated_by);
  end if;
  return new;
end $$;
create trigger settings_history_trg after insert or update on public.settings
  for each row execute function public.settings_write_history();

-- ---------------------------------------------------------------- super users
create table public.super_users (
  email text primary key check (email = lower(trim(email))),
  added_by text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_super_user(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from super_users where email = lower(trim(p_email)));
$$;

-- ---------------------------------------------------------------- members
create table public.vault_members (
  id uuid unique not null default gen_random_uuid(),
  email text primary key check (email = lower(trim(email))),
  created_via text not null check (created_via in ('sign_in','gift_offer','admin_lookup')),
  first_signed_in_at timestamptz,
  display_name text,
  shopify_customer_id text,
  is_customer boolean not null default false,
  first_order_at timestamptz,
  imagen_sessions jsonb not null default '[]'::jsonb,
  portrait_count int,
  lookup_refreshed_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger vault_members_updated before update on public.vault_members for each row execute function public.set_updated_at();
create index vault_members_name_trgm on public.vault_members using gin (display_name extensions.gin_trgm_ops);
create index vault_members_email_trgm on public.vault_members using gin (email extensions.gin_trgm_ops);

-- ---------------------------------------------------------------- themes
create table public.theme_categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  sort_order int not null default 0,
  reminder_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger theme_categories_updated before update on public.theme_categories for each row execute function public.set_updated_at();

create table public.themes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  category_id uuid not null references public.theme_categories(id),
  available_from date,
  available_to date,
  repeats_yearly boolean not null default true,
  sort_order int not null default 0,
  status text not null default 'draft' check (status in ('draft','live','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger themes_updated before update on public.themes for each row execute function public.set_updated_at();
create index themes_category_idx on public.themes (category_id, sort_order);

create table public.theme_versions (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.themes(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  status text not null default 'draft' check (status in ('draft','live','archived')),
  is_new boolean not null default false,
  sort_order int not null default 0,
  background_path text not null,
  overlay_path text,
  thumbnail_path text,
  layout jsonb not null,
  message_ideas text[] not null default '{}',
  message_max_chars int check (message_max_chars is null or message_max_chars between 20 and 1000),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (theme_id, slug)
);
create trigger theme_versions_updated before update on public.theme_versions for each row execute function public.set_updated_at();
create index theme_versions_theme_idx on public.theme_versions (theme_id, sort_order);

-- ---------------------------------------------------------------- gift offers
create table public.gift_offers (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id text unique not null,
  order_name text,
  email text not null check (email = lower(trim(email))),
  paid_at timestamptz,
  send_after timestamptz,
  sent_at timestamptz,
  email_opened_at timestamptz,
  first_used_at timestamptz,
  status text not null default 'pending' check (status in ('pending','sent','skipped','failed')),
  skip_reason text,
  token_hash text unique,
  token_expires_at timestamptz,
  portrait_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger gift_offers_updated before update on public.gift_offers for each row execute function public.set_updated_at();
create index gift_offers_email_idx on public.gift_offers (email, created_at desc);
create index gift_offers_due_idx on public.gift_offers (status, send_after);

-- ---------------------------------------------------------------- cards
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  public_id text unique not null check (public_id ~ '^C-[0-9a-z]{6}$'),
  share_slug text unique not null check (length(share_slug) >= 16),
  sender_email text not null check (sender_email = lower(trim(sender_email))),
  from_name text not null,
  to_name text not null,
  recipient_email text check (recipient_email is null or recipient_email = lower(trim(recipient_email))),
  message text not null,
  theme_id uuid references public.themes(id),
  version_id uuid references public.theme_versions(id),
  imagen_session_id text,
  imagen_image_id text,
  portrait_path text,
  crop jsonb,
  jpeg_path text,
  delivery text not null check (delivery in ('email','self')),
  scheduled_for timestamptz,
  status text not null default 'rendering' check (status in ('rendering','ready','scheduled','emailed','opened','failed','cancelled')),
  share_hidden boolean not null default false,
  render_ms int,
  entry_point text check (entry_point is null or entry_point in ('order_email','thankyou_popup','reminder_email','site_menu','home','my_cards','my_portraits','order_page','make_another','use_again')),
  flow text check (flow is null or flow in ('first','full')),
  gift_offer_id uuid references public.gift_offers(id) on delete set null,
  reused_from uuid references public.cards(id) on delete set null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger cards_updated before update on public.cards for each row execute function public.set_updated_at();
create index cards_sender_idx on public.cards (sender_email, created_at desc);
create index cards_status_sched_idx on public.cards (status, scheduled_for);
create index cards_created_idx on public.cards (created_at desc);
create index cards_to_name_trgm on public.cards using gin (to_name extensions.gin_trgm_ops);
create index cards_from_name_trgm on public.cards using gin (from_name extensions.gin_trgm_ops);
create index cards_sender_trgm on public.cards using gin (sender_email extensions.gin_trgm_ops);

create table public.card_deliveries (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  type text not null check (type in ('email','resend','download','link_copy','share')),
  channel text check (channel is null or channel in ('whatsapp','messages','facebook','instagram','native')),
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued','sent','delivered','opened','bounced','failed','done')),
  error text,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger card_deliveries_updated before update on public.card_deliveries for each row execute function public.set_updated_at();
create index card_deliveries_card_idx on public.card_deliveries (card_id, created_at);
create index card_deliveries_provider_idx on public.card_deliveries (provider_message_id) where provider_message_id is not null;
create index card_deliveries_status_idx on public.card_deliveries (status, created_at);

-- ---------------------------------------------------------------- activity log (append-only)
create table public.activity_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  email text check (email is null or email = lower(trim(email))),
  event text not null,
  source text not null check (source in ('vault','shopify','imagen','email')),
  ref_type text check (ref_type is null or ref_type in ('card','order','session','image','setting','theme','version','category','customer','request','delivery')),
  ref_id text,
  props jsonb not null default '{}'::jsonb,
  actor text not null check (actor in ('customer','recipient','system') or actor like 'super_user:%'),
  created_at timestamptz not null default now()
);
create index activity_email_idx on public.activity_log (email, occurred_at desc);
create index activity_event_idx on public.activity_log (event, occurred_at desc);
create index activity_time_idx on public.activity_log (occurred_at desc);
create index activity_ref_idx on public.activity_log (ref_type, ref_id);

-- Block update and delete for everyone except the deletion function, which sets a
-- transaction-local flag first.
create or replace function public.activity_log_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('vault.allow_activity_mutation', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'activity_log is append-only' using errcode = 'insufficient_privilege';
end $$;
create trigger activity_log_no_update before update on public.activity_log for each row execute function public.activity_log_guard();
create trigger activity_log_no_delete before delete on public.activity_log for each row execute function public.activity_log_guard();
create trigger activity_log_no_truncate before truncate on public.activity_log for each statement execute function public.activity_log_guard();

-- ---------------------------------------------------------------- suppressions
create table public.email_suppressions (
  email text not null check (email = lower(trim(email))),
  scope text not null check (scope in ('card_emails','all')),
  reason text not null check (reason in ('unsubscribe','bounce','complaint','deletion')),
  created_at timestamptz not null default now(),
  primary key (email, scope)
);

-- ---------------------------------------------------------------- outbox
create table public.outbound_events (
  id uuid primary key default gen_random_uuid(),
  destination text not null default 'klaviyo' check (destination in ('klaviyo')),
  kind text not null check (kind in ('event','profile','deletion')),
  dedupe_key text unique,
  email text check (email is null or email = lower(trim(email))),
  event_name text,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_status_code int,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger outbound_events_updated before update on public.outbound_events for each row execute function public.set_updated_at();
create index outbound_due_idx on public.outbound_events (status, next_attempt_at);
create index outbound_email_idx on public.outbound_events (email);

-- ---------------------------------------------------------------- rate limits
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  created_at timestamptz not null default now(),
  primary key (key, window_start)
);

create or replace function public.hit_rate_limit(p_key text, p_window_seconds int, p_max int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  ws timestamptz;
  c int;
begin
  if p_window_seconds <= 0 then raise exception 'window must be positive'; end if;
  ws := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into rate_limits (key, window_start, count) values (p_key, ws, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into c;
  return c <= p_max;
end $$;

create or replace function public.prune_rate_limits() returns int
language sql security definer set search_path = public as $$
  with d as (delete from rate_limits where window_start < now() - interval '1 day' returning 1)
  select count(*)::int from d;
$$;

-- ---------------------------------------------------------------- data requests
create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(trim(email))),
  type text not null check (type in ('export','delete')),
  requested_by text not null,
  status text not null default 'pending' check (status in ('pending','done','failed')),
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger data_requests_updated before update on public.data_requests for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- webhook idempotency and source checks
create table public.processed_webhooks (
  source text not null check (source in ('shopify','agentmail')),
  webhook_id text not null,
  topic text,
  created_at timestamptz not null default now(),
  primary key (source, webhook_id)
);

create table public.data_source_checks (
  source text primary key,
  ok boolean not null,
  checked_at timestamptz not null default now(),
  last_ok_at timestamptz,
  ms int,
  detail jsonb not null default '{}'::jsonb,
  checked_by text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS: on everywhere, no policies
do $$
declare t text;
begin
  foreach t in array array['settings','settings_history','super_users','vault_members','theme_categories','themes','theme_versions',
    'gift_offers','cards','card_deliveries','activity_log','email_suppressions','outbound_events','rate_limits','data_requests',
    'processed_webhooks','data_source_checks']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke all on function public.is_super_user(text) from public, anon, authenticated;
revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
revoke all on function public.prune_rate_limits() from public, anon, authenticated;
revoke all on function public.settings_write_history() from public, anon, authenticated;
grant execute on function public.is_super_user(text) to service_role;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;
grant execute on function public.prune_rate_limits() to service_role;

-- ---------------------------------------------------------------- storage buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('theme-assets', 'theme-assets', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('portraits', 'portraits', false, 26214400, array['image/jpeg','image/png','image/webp']),
  ('cards', 'cards', false, 15728640, array['image/jpeg'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------- activity + outbox in one transaction
-- lib/track.ts calls this. When p_outbox is given, the Klaviyo outbox row is written in the
-- same transaction as the activity row (docs/data.md §10). A repeated dedupe_key is ignored.
create or replace function public.record_activity(
  p_email text, p_event text, p_source text, p_ref_type text, p_ref_id text,
  p_props jsonb, p_actor text, p_outbox jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a_id bigint;
  o_id uuid;
begin
  insert into activity_log (email, event, source, ref_type, ref_id, props, actor)
  values (lower(trim(p_email)), p_event, p_source, p_ref_type, p_ref_id, coalesce(p_props, '{}'::jsonb), p_actor)
  returning id into a_id;

  if p_outbox is not null then
    insert into outbound_events (destination, kind, dedupe_key, email, event_name, payload, status)
    values (
      coalesce(p_outbox->>'destination', 'klaviyo'),
      p_outbox->>'kind',
      p_outbox->>'dedupe_key',
      lower(trim(p_outbox->>'email')),
      p_outbox->>'event_name',
      p_outbox->'payload',
      coalesce(p_outbox->>'status', 'pending')
    )
    on conflict (dedupe_key) do nothing
    returning id into o_id;
  end if;

  return jsonb_build_object('activity_id', a_id, 'outbox_id', o_id);
end $$;
revoke all on function public.record_activity(text, text, text, text, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_activity(text, text, text, text, text, jsonb, text, jsonb) to service_role;

-- Data deletion: anonymise one person's activity rows (the only allowed mutation).
create or replace function public.anonymise_activity(p_email text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('vault.allow_activity_mutation', 'on', true);
  update activity_log
     set email = null,
         props = props - 'email' - 'customer_email' - 'name'
   where email = lower(trim(p_email));
  get diagnostics n = row_count;
  perform set_config('vault.allow_activity_mutation', 'off', true);
  return n;
end $$;
revoke all on function public.anonymise_activity(text) from public, anon, authenticated;
grant execute on function public.anonymise_activity(text) to service_role;
