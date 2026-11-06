-- Dashboard: what people did with their cards in the period (emailed, shared, link copied, downloaded),
-- as distinct cards and distinct people, plus cards made in the period with none of those yet.
create or replace function public.insights_card_actions(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  with a as (
    select event, email, coalesce(props->>'card_id', ref_id) as card
    from activity_log
    where occurred_at >= p_from and occurred_at < p_to
      and event in ('card_email_sent', 'card_shared', 'card_link_copied', 'card_downloaded')
  ),
  made as (
    select coalesce(props->>'card_id', ref_id) as card
    from activity_log
    where occurred_at >= p_from and occurred_at < p_to and event = 'card_created'
  ),
  acted as (
    select distinct coalesce(props->>'card_id', ref_id) as card
    from activity_log
    where event in ('card_email_sent', 'card_shared', 'card_link_copied', 'card_downloaded')
  )
  select jsonb_build_object(
    'emailed', jsonb_build_object('cards', (select count(distinct card) from a where event = 'card_email_sent'), 'people', (select count(distinct email) from a where event = 'card_email_sent')),
    'shared', jsonb_build_object('cards', (select count(distinct card) from a where event = 'card_shared'), 'people', (select count(distinct email) from a where event = 'card_shared')),
    'link_copied', jsonb_build_object('cards', (select count(distinct card) from a where event = 'card_link_copied'), 'people', (select count(distinct email) from a where event = 'card_link_copied')),
    'downloaded', jsonb_build_object('cards', (select count(distinct card) from a where event = 'card_downloaded'), 'people', (select count(distinct email) from a where event = 'card_downloaded')),
    'made', (select count(distinct card) from made),
    'not_yet', (select count(distinct m.card) from made m where m.card is not null and m.card not in (select card from acted where card is not null))
  );
$$;

revoke all on function public.insights_card_actions(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.insights_card_actions(timestamptz, timestamptz) to service_role;
