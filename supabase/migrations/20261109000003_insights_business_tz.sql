-- 9 Nov: the dashboard counts cards per business day (brand.timezone, Pacific by default), not per UTC day.
create or replace function public.insights_cards_per_day_tz(p_from timestamptz, p_to timestamptz, p_tz text) returns table (day date, n int)
language sql stable security definer set search_path = public as $$
  select (created_at at time zone p_tz)::date as day, count(*)::int as n
  from cards where created_at >= p_from and created_at < p_to and status not in ('failed', 'rendering')
  group by 1 order by 1;
$$;
revoke all on function public.insights_cards_per_day_tz(timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.insights_cards_per_day_tz(timestamptz, timestamptz, text) to service_role;
