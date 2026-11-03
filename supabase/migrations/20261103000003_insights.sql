-- Settings › Insights: KPI counts, cards per day, top themes and the card funnel, from our own tables.
create or replace function public.insights_kpis(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'cards_created',   (select count(*) from cards where created_at >= p_from and created_at < p_to and status not in ('failed', 'rendering')),
    'people_creating', (select count(distinct sender_email) from cards where created_at >= p_from and created_at < p_to and status not in ('failed', 'rendering')),
    'emailed',         (select count(*) from activity_log where event = 'card_email_sent' and occurred_at >= p_from and occurred_at < p_to),
    'recipient_opens', (select count(*) from activity_log where event = 'card_recipient_email_opened' and occurred_at >= p_from and occurred_at < p_to),
    'recipient_taps',  (select count(*) from activity_log where event = 'card_recipient_cta_tapped' and occurred_at >= p_from and occurred_at < p_to),
    'sign_ins',        (select count(*) from activity_log where event = 'vault_signed_in' and occurred_at >= p_from and occurred_at < p_to),
    'mug_photos',      (select count(*) from activity_log where event = 'redeem_mug_saved' and occurred_at >= p_from and occurred_at < p_to),
    'downloads',       (select count(*) from activity_log where event in ('redeem_download_completed', 'redeem_download_all_completed') and occurred_at >= p_from and occurred_at < p_to)
  );
$$;

create or replace function public.insights_cards_per_day(p_from timestamptz, p_to timestamptz) returns table (day date, n int)
language sql stable security definer set search_path = public as $$
  select (created_at at time zone 'UTC')::date as day, count(*)::int as n
  from cards where created_at >= p_from and created_at < p_to and status not in ('failed', 'rendering')
  group by 1 order by 1;
$$;

create or replace function public.insights_top_themes(p_from timestamptz, p_to timestamptz, p_limit int default 8) returns table (theme text, version text, n int)
language sql stable security definer set search_path = public as $$
  select t.name, v.name, count(*)::int
  from cards c join themes t on t.id = c.theme_id left join theme_versions v on v.id = c.version_id
  where c.created_at >= p_from and c.created_at < p_to and c.status not in ('failed', 'rendering')
  group by t.name, v.name order by 3 desc, 1 limit p_limit;
$$;

-- People reaching each step (distinct emails), first card and full builder together.
create or replace function public.insights_funnel(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  with a as (select email, event from activity_log where occurred_at >= p_from and occurred_at < p_to and email is not null)
  select jsonb_build_object(
    'signed_in', (select count(distinct email) from a where event = 'vault_signed_in'),
    'theme_selected', (select count(distinct email) from a where event in ('card_theme_selected', 'card_first_design_changed', 'card_create_tapped')),
    'create_tapped', (select count(distinct email) from a where event = 'card_create_tapped'),
    'created', (select count(distinct email) from a where event = 'card_created'),
    'delivered', (select count(distinct email) from a where event in ('card_email_sent', 'card_shared', 'card_downloaded', 'card_link_copied'))
  );
$$;

revoke all on function public.insights_kpis(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.insights_cards_per_day(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.insights_top_themes(timestamptz, timestamptz, int) from public, anon, authenticated;
revoke all on function public.insights_funnel(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.insights_kpis(timestamptz, timestamptz) to service_role;
grant execute on function public.insights_cards_per_day(timestamptz, timestamptz) to service_role;
grant execute on function public.insights_top_themes(timestamptz, timestamptz, int) to service_role;
grant execute on function public.insights_funnel(timestamptz, timestamptz) to service_role;
