-- `retry_report` has an input parameter named `report_id`. PostgreSQL therefore
-- treats `on conflict (report_id)` as ambiguous inside PL/pgSQL. Target the
-- table's named unique constraint so an authorized owner can actually requeue
-- a failed report without weakening the existing owner and consent checks.
create or replace function public.retry_report(report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  rid uuid;
begin
  if uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('entitlement:' || uid::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('processing-consent:' || uid::text, 0)
  );
  if not private.has_processing_consent(uid) then
    raise exception 'processing consent required' using errcode = '42501';
  end if;
  select r.id into strict rid
  from public.reports r join public.chapters c on c.id = r.chapter_id
  where r.id = retry_report.report_id and c.user_id = uid and r.status = 'failed'
  for update;
  update public.reports set status = 'queued', error_code = null, trace_id = null where id = rid;
  insert into private.report_jobs(report_id) values (rid)
  on conflict on constraint report_jobs_report_id_key do update
    set status = 'queued', next_attempt_at = now(), lease_until = null,
        error_code = null, updated_at = now();
end
$$;

revoke all on function public.retry_report(uuid) from public, anon, authenticated;
grant execute on function public.retry_report(uuid) to authenticated;
