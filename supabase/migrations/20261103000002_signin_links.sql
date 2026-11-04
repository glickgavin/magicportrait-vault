-- One-tap sign-in links (/g/[token]). The token itself is never stored: only HMAC(GIFT_LINK_SECRET, token).
-- Gift offers keep their token hash on gift_offers too (docs/schema.md); this table also covers links
-- that aren't gift offers (a super user resending a link, the mug-photo reminder's order link).
create table public.signin_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null check (length(token_hash) = 64),
  email text not null check (email = lower(trim(email))),
  purpose text not null check (purpose in ('gift_offer','admin_resend','mug_reminder','gift_reminder')),
  redirect_path text not null default '/create' check (redirect_path ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  gift_offer_id uuid references public.gift_offers(id) on delete cascade,
  order_legacy_id text,
  expires_at timestamptz not null,
  first_used_at timestamptz,
  last_used_at timestamptz,
  use_count int not null default 0,
  created_by text not null default 'system',
  created_at timestamptz not null default now()
);
create index signin_links_email_idx on public.signin_links (email, created_at desc);
alter table public.signin_links enable row level security;
revoke all on public.signin_links from anon, authenticated;
