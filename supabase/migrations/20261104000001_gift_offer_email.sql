-- Free gift offer email sent by the app through AgentMail (instead of a Klaviyo flow), with
-- delivery tracking from AgentMail webhooks. Clicks are already tracked: opening the one-tap link
-- sets gift_offers.first_used_at (app/g/[token]).
alter table public.gift_offers
  add column provider_message_id text unique,
  add column email_status text check (email_status in ('sent','delivered','bounced','complained','failed')),
  add column delivered_at timestamptz,
  add column email_error text;

-- "Don't email me offers" is its own scope, separate from card emails.
alter table public.email_suppressions drop constraint email_suppressions_scope_check;
alter table public.email_suppressions add constraint email_suppressions_scope_check check (scope in ('card_emails','offer_emails','all'));

-- Settings › Emails: sent / delivered / bounced / clicked / cards made, for offers sent since `since`.
create or replace function public.gift_offer_email_stats(since timestamptz)
returns table (sent bigint, delivered bigint, bounced bigint, failed bigint, clicked bigint, cards_made bigint)
language sql stable security definer set search_path = public as $$
  select
    count(*) filter (where o.email_status is not null and o.email_status <> 'failed'),
    count(*) filter (where o.email_status = 'delivered' or (o.delivered_at is not null)),
    count(*) filter (where o.email_status in ('bounced','complained')),
    count(*) filter (where o.email_status = 'failed'),
    count(*) filter (where o.first_used_at is not null),
    count(*) filter (where exists (select 1 from public.cards c where c.sender_email = o.email and c.created_at >= o.sent_at))
  from public.gift_offers o
  where o.sent_at >= since;
$$;
revoke all on function public.gift_offer_email_stats(timestamptz) from public, anon, authenticated;
