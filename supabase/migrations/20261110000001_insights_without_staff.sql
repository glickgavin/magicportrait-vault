-- 10 Nov: the dashboard leaves out super users' own activity and cards by default (p_staff = false).
-- New overloads take p_staff with no default, so calls without it still reach the earlier versions
-- (no ambiguity while old and new code overlap during a deploy).
-- "Staff" = an email in super_users; a card counts as staff when its sender is, an event when its email is.

create or replace function public.insights_kpis(p_from timestamptz, p_to timestamptz, p_staff boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  with c as (select * from cards where created_at >= p_from and created_at < p_to and status not in ('failed', 'rendering')
             and (p_staff or sender_email not in (select email from super_users))),
  a as (select event from activity_log where occurred_at >= p_from and occurred_at < p_to
        and (p_staff or email is null or email not in (select email from super_users)))
  select jsonb_build_object(
    'cards_created',   (select count(*) from c),
    'people_creating', (select count(distinct sender_email) from c),
    'emailed',         (select count(*) from a where event = 'card_email_sent'),
    'recipient_opens', (select count(*) from a where event = 'card_recipient_email_opened'),
    'recipient_taps',  (select count(*) from a where event = 'card_recipient_cta_tapped'),
    'sign_ins',        (select count(*) from a where event = 'vault_signed_in'),
    'mug_photos',      (select count(*) from a where event = 'redeem_mug_saved'),
    'downloads',       (select count(*) from a where event in ('redeem_download_completed', 'redeem_download_all_completed'))
  );
$$;

create or replace function public.insights_cards_per_day_tz(p_from timestamptz, p_to timestamptz, p_tz text, p_staff boolean) returns table (day date, n int)
language sql stable security definer set search_path = public as $$
  select (created_at at time zone p_tz)::date as day, count(*)::int as n
  from cards where created_at >= p_from and created_at < p_to and status not in ('failed', 'rendering')
    and (p_staff or sender_email not in (select email from super_users))
  group by 1 order by 1;
$$;

create or replace function public.insights_top_themes(p_from timestamptz, p_to timestamptz, p_limit int, p_staff boolean) returns table (theme text, version text, n int)
language sql stable security definer set search_path = public as $$
  select t.name, v.name, count(*)::int
  from cards c join themes t on t.id = c.theme_id left join theme_versions v on v.id = c.version_id
  where c.created_at >= p_from and c.created_at < p_to and c.status not in ('failed', 'rendering')
    and (p_staff or c.sender_email not in (select email from super_users))
  group by t.name, v.name order by 3 desc, 1 limit p_limit;
$$;

create or replace function public.insights_funnel(p_from timestamptz, p_to timestamptz, p_staff boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  with a as (select email, event from activity_log where occurred_at >= p_from and occurred_at < p_to and email is not null
             and (p_staff or email not in (select email from super_users)))
  select jsonb_build_object(
    'signed_in', (select count(distinct email) from a where event = 'vault_signed_in'),
    'theme_selected', (select count(distinct email) from a where event in ('card_theme_selected', 'card_first_design_changed', 'card_create_tapped')),
    'create_tapped', (select count(distinct email) from a where event = 'card_create_tapped'),
    'created', (select count(distinct email) from a where event = 'card_created'),
    'delivered', (select count(distinct email) from a where event in ('card_email_sent', 'card_shared', 'card_downloaded', 'card_link_copied'))
  );
$$;

create or replace function public.insights_card_actions(p_from timestamptz, p_to timestamptz, p_staff boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  with log as (
    select event, email, occurred_at, coalesce(props->>'card_id', ref_id) as card from activity_log
    where event in ('card_email_sent', 'card_shared', 'card_link_copied', 'card_downloaded', 'card_created')
      and (p_staff or email is null or email not in (select email from super_users))
  ),
  a as (select * from log where occurred_at >= p_from and occurred_at < p_to and event <> 'card_created'),
  made as (select card from log where occurred_at >= p_from and occurred_at < p_to and event = 'card_created'),
  acted as (select distinct card from log where event <> 'card_created')
  select jsonb_build_object(
    'emailed', jsonb_build_object('cards', (select count(distinct card) from a where event = 'card_email_sent'), 'people', (select count(distinct email) from a where event = 'card_email_sent')),
    'shared', jsonb_build_object('cards', (select count(distinct card) from a where event = 'card_shared'), 'people', (select count(distinct email) from a where event = 'card_shared')),
    'link_copied', jsonb_build_object('cards', (select count(distinct card) from a where event = 'card_link_copied'), 'people', (select count(distinct email) from a where event = 'card_link_copied')),
    'downloaded', jsonb_build_object('cards', (select count(distinct card) from a where event = 'card_downloaded'), 'people', (select count(distinct email) from a where event = 'card_downloaded')),
    'made', (select count(distinct card) from made),
    'not_yet', (select count(distinct m.card) from made m where m.card is not null and m.card not in (select card from acted where card is not null))
  );
$$;

create or replace function public.insights_entries(p_from timestamptz, p_to timestamptz, p_staff boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  with a as (
    select event, email, props, occurred_at from activity_log where occurred_at >= p_from and occurred_at < p_to
      and (p_staff or email is null or email not in (select email from super_users))
  ),
  made as (select distinct email from a where event = 'card_created' and email is not null),
  offer_openers as (select distinct email from a where event = 'gift_offer_email_opened' and email is not null),
  link_signins as (select distinct props->>'entry' as entry, email from a where event = 'vault_signed_in' and props->>'entry' is not null and props->>'entry' <> 'offer_email' and email is not null),
  link_clicks as (select props->>'entry' as entry, count(*) as clicks from a where event = 'vault_entry_link_opened' group by 1),
  entries as (select entry from link_clicks union select entry from link_signins)
  select jsonb_build_object(
    'offer_email', jsonb_build_object(
      'sent', (select count(*) from a where event = 'gift_offer_email_sent'),
      'clicked', (select count(*) from offer_openers),
      'cards', (select count(*) from offer_openers o where o.email in (select email from made))
    ),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'entry', e.entry,
        'clicks', coalesce((select clicks from link_clicks c where c.entry = e.entry), 0),
        'signed_in', (select count(*) from link_signins s where s.entry = e.entry),
        'cards', (select count(*) from link_signins s where s.entry = e.entry and s.email in (select email from made))
      ) order by e.entry)
      from entries e
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.insights_kpis(timestamptz, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.insights_cards_per_day_tz(timestamptz, timestamptz, text, boolean) from public, anon, authenticated;
revoke all on function public.insights_top_themes(timestamptz, timestamptz, int, boolean) from public, anon, authenticated;
revoke all on function public.insights_funnel(timestamptz, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.insights_card_actions(timestamptz, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.insights_entries(timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.insights_kpis(timestamptz, timestamptz, boolean) to service_role;
grant execute on function public.insights_cards_per_day_tz(timestamptz, timestamptz, text, boolean) to service_role;
grant execute on function public.insights_top_themes(timestamptz, timestamptz, int, boolean) to service_role;
grant execute on function public.insights_funnel(timestamptz, timestamptz, boolean) to service_role;
grant execute on function public.insights_card_actions(timestamptz, timestamptz, boolean) to service_role;
grant execute on function public.insights_entries(timestamptz, timestamptz, boolean) to service_role;
