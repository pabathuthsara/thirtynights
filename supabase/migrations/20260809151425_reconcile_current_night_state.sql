-- Keep the persisted schedule state aligned with the chapter's civil date.
-- The original reconciliation only marked past nights as missed, leaving the
-- current night in its initial `future` state for cloud hydration to return.
create or replace function public.reconcile_chapter_state()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c public.chapters%rowtype;
  local_today date;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into strict c
  from public.chapters
  where user_id = uid and completed_at is null
  order by started_at desc
  limit 1
  for update;

  local_today := (now() at time zone c.timezone)::date;

  update public.nights
  set state = case
    when index > c.access_through then 'future'
    when expected_local_date < local_today then 'missed'
    when expected_local_date = local_today then 'today'
    else 'future'
  end
  where chapter_id = c.id
    and recorded_at is null;

  perform private.queue_eligible_reports(c.id);
end
$$;

revoke all on function public.reconcile_chapter_state() from public, anon, authenticated;
grant execute on function public.reconcile_chapter_state() to authenticated;

-- Repair schedules already persisted with stale temporal states. Future
-- reconciliations remain user-scoped through the RPC above.
update public.nights as n
set state = case
  when n.index > c.access_through then 'future'
  when n.expected_local_date < (now() at time zone c.timezone)::date then 'missed'
  when n.expected_local_date = (now() at time zone c.timezone)::date then 'today'
  else 'future'
end
from public.chapters as c
where n.chapter_id = c.id
  and c.completed_at is null
  and n.recorded_at is null;
