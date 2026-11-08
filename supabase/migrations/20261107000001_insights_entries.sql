-- Dashboard "Where people came from": the free gift offer email (sent → clicked → made a card) and each
-- tracked entry link such as /from/invoice (clicks → signed in → made a card), for the period.
create or replace function public.insights_entries(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  with a as (
    select event, email, props, occurred_at from activity_log where occurred_at >= p_from and occurred_at < p_to
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

revoke all on function public.insights_entries(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.insights_entries(timestamptz, timestamptz) to service_role;
