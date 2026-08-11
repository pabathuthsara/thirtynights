-- Make chapter access a projection of the purchase ledger, never of whichever
-- webhook happened to arrive last. Also persist processing consent at the
-- server boundary so uploads and report work cannot continue after withdrawal.

alter table public.users
  add column if not exists processing_consent_version text,
  add column if not exists processing_consent_granted_at timestamptz,
  add column if not exists processing_consent_withdrawn_at timestamptz;

alter table public.users drop constraint if exists users_processing_consent_version_check;
alter table public.users add constraint users_processing_consent_version_check check (
  processing_consent_version is null
  or processing_consent_version ~ '^cloud-processing-v[1-9][0-9]*$'
);
alter table public.users drop constraint if exists users_processing_consent_state_check;
alter table public.users add constraint users_processing_consent_state_check check (
  (
    processing_consent_version is not null
    and processing_consent_granted_at is not null
    and processing_consent_withdrawn_at is null
  )
  or (
    processing_consent_version is null
    and (processing_consent_granted_at is null or processing_consent_withdrawn_at is not null)
  )
);

create table if not exists private.processing_consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  action text not null check (action in ('granted', 'withdrawn')),
  consent_version text,
  occurred_at timestamptz not null default now(),
  check (
    (action = 'granted' and consent_version is not null)
    or (action = 'withdrawn' and consent_version is null)
  )
);
revoke all on table private.processing_consent_events from public, anon, authenticated;

-- Cover delete/cascade and worker evidence lookups called out by the hosted
-- database advisor. These are additive and safe on existing installations.
create index if not exists deletion_requests_user_id_idx
  on public.deletion_requests(user_id);
create index if not exists transcript_segments_night_id_idx
  on private.transcript_segments(night_id);

create or replace function private.has_processing_consent(user_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = user_uuid
      and u.auth_provider <> 'anonymous'
      and u.deleted_at is null
      and u.processing_consent_version is not null
      and u.processing_consent_granted_at is not null
      and u.processing_consent_withdrawn_at is null
  )
$$;
revoke all on function private.has_processing_consent(uuid) from public, anon, authenticated;

-- `target_length` remains a historical schedule high-water mark so prior
-- nights and reports are never erased. `plan_state`, `purchase_status`, and
-- `access_through` are the current authoritative entitlement projection.
create or replace function private.recompute_user_entitlement(user_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.chapters%rowtype;
  active_purchase public.purchases%rowtype;
  latest_purchase public.purchases%rowtype;
  effective_target integer := 7;
  historical_target integer := 7;
  effective_plan text := 'trial';
  effective_status text := 'none';
  effective_purchase_id uuid;
begin
  if user_uuid is null or not exists (select 1 from public.users where id = user_uuid) then
    raise exception 'ledger user not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('entitlement:' || user_uuid::text, 0)
  );
  perform p.id from public.purchases p where p.user_id = user_uuid for update;

  select p.* into active_purchase
  from public.purchases p
  where p.user_id = user_uuid
    and p.status = 'granted'
    and p.revoked_at is null
    and coalesce(p.normalized_product, p.product_id) in ('nights_30', 'nights_90')
  order by
    case coalesce(p.normalized_product, p.product_id) when 'nights_90' then 90 else 30 end desc,
    coalesce(p.granted_at, p.purchased_at) desc,
    p.id desc
  limit 1;

  if active_purchase.id is not null then
    effective_target := case
      when coalesce(active_purchase.normalized_product, active_purchase.product_id) = 'nights_90' then 90
      else 30
    end;
    effective_plan := case when effective_target = 90 then 'paid90' else 'paid30' end;
    effective_status := 'granted';
    effective_purchase_id := active_purchase.id;
  else
    select p.* into latest_purchase
    from public.purchases p
    where p.user_id = user_uuid
    order by coalesce(p.revoked_at, p.granted_at, p.purchased_at) desc, p.id desc
    limit 1;
    if latest_purchase.id is not null then
      effective_status := case
        when latest_purchase.status = 'pending' then 'verifying'
        when latest_purchase.status in ('refunded', 'revoked') then latest_purchase.status
        else 'none'
      end;
    end if;
  end if;

  select chapters.* into c
  from public.chapters chapters
  where chapters.user_id = user_uuid
  order by (chapters.completed_at is null) desc, chapters.started_at desc
  limit 1
  for update;

  if c.id is null then
    insert into public.chapters (
      user_id, length, target_length, access_through, question_set, timezone,
      plan_state, purchase_status, purchase_id
    ) values (
      user_uuid, effective_target, effective_target, effective_target, 'set_a', 'UTC',
      effective_plan, effective_status, effective_purchase_id
    ) returning * into c;
  else
    historical_target := greatest(c.target_length, effective_target);
    update public.chapters
    set length = greatest(length, historical_target),
        target_length = historical_target,
        access_through = effective_target,
        plan_state = effective_plan,
        purchase_status = effective_status,
        purchase_id = effective_purchase_id,
        server_revision = server_revision + 1
    where id = c.id;
  end if;

  historical_target := greatest(c.target_length, effective_target);
  perform private.ensure_chapter_nights(c.id, effective_target);

  update private.report_jobs j
  set status = 'cancelled', lease_until = null,
      error_code = 'entitlement_revoked', updated_at = now()
  from public.reports r
  where j.report_id = r.id and r.chapter_id = c.id
    and r.checkpoint_night > effective_target
    and j.status in ('queued', 'retry', 'leased');
  update public.reports r
  set status = 'failed', error_code = 'entitlement_revoked', trace_id = null
  from private.report_jobs j
  where j.report_id = r.id and r.chapter_id = c.id
    and j.status = 'cancelled' and j.error_code = 'entitlement_revoked'
    and r.status in ('queued', 'running');
  delete from private.transcript_segments t
  using private.report_jobs j, public.reports r
  where t.report_job_id = j.id and j.report_id = r.id and r.chapter_id = c.id
    and j.status = 'cancelled' and j.error_code = 'entitlement_revoked';

  if private.has_processing_consent(user_uuid) then
    update private.report_jobs j
    set status = 'queued', lease_until = null, next_attempt_at = now(),
        error_code = null, updated_at = now()
    from public.reports r
    where j.report_id = r.id and r.chapter_id = c.id
      and r.checkpoint_night <= effective_target
      and j.status = 'cancelled' and j.error_code = 'entitlement_revoked';
    update public.reports r
    set status = 'queued', error_code = null, trace_id = null
    from private.report_jobs j
    where j.report_id = r.id and r.chapter_id = c.id
      and j.status = 'queued' and r.error_code = 'entitlement_revoked';
    perform private.queue_eligible_reports(c.id);
  end if;

  return jsonb_build_object(
    'chapter_id', c.id,
    'plan_state', effective_plan,
    'purchase_status', effective_status,
    'access_through', effective_target,
    'historical_target_length', historical_target,
    'purchase_id', effective_purchase_id
  );
end
$$;
revoke all on function private.recompute_user_entitlement(uuid) from public, anon, authenticated;

create or replace function private.queue_eligible_reports(chapter_uuid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.chapters%rowtype;
  checkpoint integer;
  latest_backed integer;
begin
  select * into strict c from public.chapters where id = chapter_uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('entitlement:' || c.user_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('processing-consent:' || c.user_id::text, 0)
  );
  if not private.has_processing_consent(c.user_id) then
    return;
  end if;

  select coalesce(max(index), 0) into latest_backed
  from public.nights
  where chapter_id = c.id and storage_path is not null;

  foreach checkpoint in array array[7, 30, 60, 90] loop
    if checkpoint <= c.access_through and (
      latest_backed >= checkpoint
      or exists (
        select 1 from public.nights
        where chapter_id = c.id
          and index = checkpoint
          and expected_local_date < (now() at time zone c.timezone)::date
      )
    ) and exists (
      select 1 from public.nights
      where chapter_id = c.id and index <= checkpoint and storage_path is not null
    ) and not exists (
      select 1 from public.nights
      where chapter_id = c.id and index <= checkpoint
        and recorded_at is not null and storage_path is null
    ) then
      insert into public.reports(chapter_id, kind, checkpoint_night, status, report_version)
      values (c.id, case when checkpoint = 7 then 'mini' else 'full' end, checkpoint, 'queued', 'v1')
      on conflict (chapter_id, checkpoint_night) do nothing;

      insert into private.report_jobs(report_id)
      select id from public.reports where chapter_id = c.id and checkpoint_night = checkpoint
      on conflict (report_id) do nothing;
    end if;
  end loop;
end
$$;
revoke all on function private.queue_eligible_reports(uuid) from public, anon, authenticated;

alter table private.transcript_segments
  add column if not exists report_job_id uuid references private.report_jobs(id) on delete cascade;
create index if not exists transcript_segments_report_job_id_idx
  on private.transcript_segments(report_job_id);

create or replace function private.enforce_transcript_processing_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_user_id uuid;
begin
  select c.user_id into job_user_id
  from private.report_jobs j
  join public.reports r on r.id = j.report_id
  join public.chapters c on c.id = r.chapter_id
  where j.id = new.report_job_id;
  if job_user_id is null then
    raise exception 'processing consent is not active' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('entitlement:' || job_user_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('processing-consent:' || job_user_id::text, 0)
  );
  if not exists (
    select 1
    from private.report_jobs j
    join public.reports r on r.id = j.report_id
    join public.chapters c on c.id = r.chapter_id
    where j.id = new.report_job_id
      and j.status = 'leased'
      and r.checkpoint_night <= c.access_through
      and private.has_processing_consent(c.user_id)
  ) then
    raise exception 'processing consent is not active' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function private.enforce_transcript_processing_consent() from public, anon, authenticated;

drop trigger if exists enforce_transcript_processing_consent on private.transcript_segments;
create trigger enforce_transcript_processing_consent
before insert or update of report_job_id on private.transcript_segments
for each row execute function private.enforce_transcript_processing_consent();

create or replace function public.set_processing_consent(requested_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  prior_version text;
  chapter_uuid uuid;
begin
  if uid is null
    or coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
    or not exists (
      select 1 from public.users
      where id = uid and auth_provider <> 'anonymous' and deleted_at is null
    )
  then
    raise exception 'permanent account required' using errcode = '42501';
  end if;
  if requested_version is not null and requested_version <> 'cloud-processing-v2' then
    raise exception 'unsupported processing consent version';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('entitlement:' || uid::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('processing-consent:' || uid::text, 0)
  );
  select processing_consent_version into prior_version
  from public.users where id = uid for update;

  if requested_version is not null then
    if prior_version is distinct from requested_version then
      update public.users
      set processing_consent_version = requested_version,
          processing_consent_granted_at = now(),
          processing_consent_withdrawn_at = null
      where id = uid;
      insert into private.processing_consent_events(user_id, action, consent_version)
      values (uid, 'granted', requested_version);
    end if;

    update private.report_jobs j
    set status = 'queued', lease_until = null, next_attempt_at = now(),
        error_code = null, updated_at = now()
    from public.reports r, public.chapters c
    where j.report_id = r.id and r.chapter_id = c.id and c.user_id = uid
      and r.checkpoint_night <= c.access_through
      and j.status = 'cancelled' and j.error_code = 'processing_consent_withdrawn';
    update public.reports r
    set status = 'queued', error_code = null, trace_id = null
    from private.report_jobs j, public.chapters c
    where j.report_id = r.id and r.chapter_id = c.id and c.user_id = uid
      and j.status = 'queued' and r.error_code = 'processing_consent_withdrawn';

    for chapter_uuid in
      select id from public.chapters where user_id = uid
    loop
      perform private.queue_eligible_reports(chapter_uuid);
    end loop;
  else
    if prior_version is not null then
      update public.users
      set processing_consent_version = null,
          processing_consent_withdrawn_at = now()
      where id = uid;
      insert into private.processing_consent_events(user_id, action, consent_version)
      values (uid, 'withdrawn', null);
    end if;

    update private.report_jobs j
    set status = 'cancelled', lease_until = null,
        error_code = 'processing_consent_withdrawn', updated_at = now()
    from public.reports r, public.chapters c
    where j.report_id = r.id and r.chapter_id = c.id and c.user_id = uid
      and j.status in ('queued', 'retry', 'leased');
    update public.reports r
    set status = 'failed', error_code = 'processing_consent_withdrawn', trace_id = null
    from private.report_jobs j, public.chapters c
    where j.report_id = r.id and r.chapter_id = c.id and c.user_id = uid
      and j.status = 'cancelled'
      and j.error_code = 'processing_consent_withdrawn'
      and r.status in ('queued', 'running');
    delete from private.transcript_segments t
    using private.report_jobs j, public.reports r, public.chapters c
    where t.report_job_id = j.id and j.report_id = r.id and r.chapter_id = c.id
      and c.user_id = uid and j.status = 'cancelled'
      and j.error_code = 'processing_consent_withdrawn';
  end if;

  return jsonb_build_object(
    'processing_consent_version', requested_version,
    'active', requested_version is not null
  );
end
$$;
revoke all on function public.set_processing_consent(text) from public, anon, authenticated;
grant execute on function public.set_processing_consent(text) to authenticated;

drop policy if exists recordings_processing_consent_insert on storage.objects;
create policy recordings_processing_consent_insert on storage.objects
as restrictive for insert to authenticated
with check (
  bucket_id <> 'recordings'
  or exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.processing_consent_version is not null
      and u.processing_consent_withdrawn_at is null
  )
);

drop policy if exists recordings_processing_consent_update on storage.objects;
create policy recordings_processing_consent_update on storage.objects
as restrictive for update to authenticated
using (
  bucket_id <> 'recordings'
  or exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.processing_consent_version is not null
      and u.processing_consent_withdrawn_at is null
  )
)
with check (
  bucket_id <> 'recordings'
  or exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.processing_consent_version is not null
      and u.processing_consent_withdrawn_at is null
  )
);

create or replace function public.attach_night_audio(
  night_id uuid,
  storage_path text,
  expected_checksum text,
  expected_byte_size bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n public.nights%rowtype;
  object_row jsonb;
  object_size bigint;
  object_checksum text;
  expected_path text;
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'permanent account required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('entitlement:' || uid::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('processing-consent:' || uid::text, 0)
  );
  if not private.has_processing_consent(uid) then
    raise exception 'processing consent required' using errcode = '42501';
  end if;

  select nights.* into strict n
  from public.nights nights
  join public.chapters c on c.id = nights.chapter_id
  where c.user_id = uid
    and (nights.id = attach_night_audio.night_id or nights.client_id = attach_night_audio.night_id)
  for update;

  if n.recorded_at is null or n.checksum is null or n.byte_size is null then
    raise exception 'night is not sealed';
  end if;

  expected_path := uid::text || '/' || n.chapter_id::text || '/' || coalesce(n.client_id, n.id)::text || '.m4a';
  if storage_path <> expected_path then
    raise exception 'invalid object path';
  end if;
  if n.storage_path is not null and n.storage_path <> storage_path then
    raise exception 'audio attachment is immutable';
  end if;

  select to_jsonb(o) into object_row
  from storage.objects o
  where o.bucket_id = 'recordings' and o.name = storage_path;
  if object_row is null then raise exception 'uploaded object not found'; end if;

  object_size := coalesce((object_row->'metadata'->>'size')::bigint, (object_row->>'size')::bigint);
  object_checksum := lower(coalesce(object_row->'user_metadata'->>'sha256', object_row->'metadata'->>'sha256'));
  if object_size is distinct from expected_byte_size then raise exception 'object size mismatch'; end if;
  if object_checksum is not null and object_checksum <> lower(expected_checksum) then raise exception 'object checksum mismatch'; end if;
  if n.checksum is distinct from lower(expected_checksum) or n.byte_size is distinct from expected_byte_size then
    raise exception 'sealed metadata mismatch';
  end if;

  update public.nights set storage_path = attach_night_audio.storage_path where id = n.id;
  perform private.queue_eligible_reports(n.chapter_id);
end
$$;
revoke all on function public.attach_night_audio(uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function public.attach_night_audio(uuid, text, text, bigint) to authenticated;

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
  on conflict (report_id) do update
    set status = 'queued', next_attempt_at = now(), lease_until = null,
        error_code = null, updated_at = now();
end
$$;
revoke all on function public.retry_report(uuid) from public, anon, authenticated;
grant execute on function public.retry_report(uuid) to authenticated;

-- Existing rows predate server-recorded consent. Pause them until the owner
-- explicitly accepts the current disclosure and the RPC re-queues the work.
update private.report_jobs j
set status = 'cancelled', lease_until = null,
    error_code = 'processing_consent_withdrawn', updated_at = now()
from public.reports r, public.chapters c, public.users u
where j.report_id = r.id and r.chapter_id = c.id and c.user_id = u.id
  and u.processing_consent_version is null
  and j.status in ('queued', 'retry', 'leased');
update public.reports r
set status = 'failed', error_code = 'processing_consent_withdrawn', trace_id = null
from private.report_jobs j, public.chapters c
where j.report_id = r.id and r.chapter_id = c.id
  and j.status = 'cancelled' and j.error_code = 'processing_consent_withdrawn'
  and r.status in ('queued', 'running');

-- RevenueCat TRANSFER webhooks have no product or transaction identifiers.
-- Therefore a transfer is accepted only when its alias arrays resolve to one
-- existing permanent destination UUID and at least one different permanent
-- source UUID that owns ledger rows. Ambiguous/anonymous-only transfers are
-- recorded but fail closed without changing access.
create or replace function public.process_revenuecat_event(event jsonb, payload_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id text := nullif(event->>'id', '');
  event_type text := upper(nullif(event->>'type', ''));
  uid uuid;
  raw_uid text := nullif(event->>'app_user_id', '');
  store_product text := nullif(event->>'product_id', '');
  normalized text;
  transaction_ref text := coalesce(
    nullif(event->>'transaction_id', ''),
    nullif(event->>'original_transaction_id', ''),
    event_id
  );
  transaction_owner uuid;
  purchase_uuid uuid;
  prior_hash text;
  existing_outcome text;
  result jsonb;
  entitlement jsonb;
  destination_ids uuid[] := array[]::uuid[];
  source_ids uuid[] := array[]::uuid[];
  transferred_purchase_ids uuid[] := array[]::uuid[];
  destination_uid uuid;
  source_uid uuid;
  affected integer := 0;
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'server role required' using errcode = '42501';
  end if;
  if event_id is null or event_type is null then raise exception 'invalid event'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('revenuecat:' || event_id, 0)
  );
  select w.payload_hash, w.outcome into prior_hash, existing_outcome
  from public.webhook_events w
  where w.provider = 'revenuecat' and w.provider_event_id = event_id;
  if prior_hash is not null and prior_hash is distinct from payload_hash then
    raise exception 'webhook event payload mismatch';
  end if;
  if existing_outcome is not null then
    return jsonb_build_object('outcome', existing_outcome, 'duplicate', true);
  end if;
  insert into public.webhook_events(provider, provider_event_id, payload_hash, event_type)
  values ('revenuecat', event_id, payload_hash, event_type)
  on conflict (provider, provider_event_id) do nothing;

  if event_type = 'TRANSFER' then
    if jsonb_typeof(event->'transferred_to') <> 'array'
      or jsonb_typeof(event->'transferred_from') <> 'array'
    then
      result := jsonb_build_object('outcome', 'rejected_transfer_identity');
    else
      select coalesce(array_agg(distinct u.id order by u.id), array[]::uuid[])
      into destination_ids
      from jsonb_array_elements_text(event->'transferred_to') destination(value)
      join public.users u on u.id::text = lower(trim(destination.value))
      where u.auth_provider <> 'anonymous' and u.deleted_at is null;

      if cardinality(destination_ids) = 1 then destination_uid := destination_ids[1]; end if;

      select coalesce(array_agg(distinct u.id order by u.id), array[]::uuid[])
      into source_ids
      from jsonb_array_elements_text(event->'transferred_from') source(value)
      join public.users u on u.id::text = lower(trim(source.value))
      where u.auth_provider <> 'anonymous' and u.deleted_at is null
        and (destination_uid is null or u.id <> destination_uid);

      if destination_uid is null or cardinality(source_ids) = 0 then
        result := jsonb_build_object('outcome', 'rejected_transfer_identity');
      else
        for source_uid in
          select candidate
          from unnest(source_ids || array[destination_uid]) candidate
          order by candidate
        loop
          perform pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended('entitlement:' || source_uid::text, 0)
          );
        end loop;

        select coalesce(array_agg(p.id order by p.id), array[]::uuid[])
        into transferred_purchase_ids
        from public.purchases p where p.user_id = any(source_ids);

        if cardinality(transferred_purchase_ids) = 0 then
          result := jsonb_build_object('outcome', 'rejected_transfer_ledger_not_found');
        else
          update public.purchases set user_id = destination_uid
          where id = any(transferred_purchase_ids);
          get diagnostics affected = row_count;

          update public.chapters
          set purchase_id = null, server_revision = server_revision + 1
          where user_id = any(source_ids) and purchase_id = any(transferred_purchase_ids);

          foreach source_uid in array source_ids loop
            perform private.recompute_user_entitlement(source_uid);
          end loop;
          entitlement := private.recompute_user_entitlement(destination_uid);
          result := jsonb_build_object(
            'outcome', 'transferred',
            'destination_user_id', destination_uid,
            'purchase_count', affected,
            'entitlement', entitlement
          );
        end if;
      end if;
    end if;
  else
    if raw_uid is not null
      and raw_uid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      uid := raw_uid::uuid;
    end if;
    normalized := case store_product
      when 'com.thirtynights.nights30' then 'nights_30'
      when 'nights_30' then 'nights_30'
      when 'com.thirtynights.nights90' then 'nights_90'
      when 'nights_90' then 'nights_90'
      else null
    end;

    if uid is null or not exists (
      select 1 from public.users
      where id = uid and auth_provider <> 'anonymous' and deleted_at is null
    ) then
      result := jsonb_build_object('outcome', 'rejected_invalid_identity');
    elsif event_type in ('INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE', 'RENEWAL') then
      if normalized is null then
        result := jsonb_build_object('outcome', 'rejected_invalid_product');
      else
        perform pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended('entitlement:' || uid::text, 0)
        );
        select p.user_id into transaction_owner
        from public.purchases p where p.transaction_id = transaction_ref for update;

        if transaction_owner is not null and transaction_owner <> uid then
          result := jsonb_build_object('outcome', 'rejected_account_mismatch');
        else
          insert into public.purchases(
            user_id, product_id, transaction_id, amount_usd, store, environment,
            store_product_id, normalized_product, order_id, purchase_token,
            currency, price, status, granted_at, revoked_at, purchased_at
          ) values (
            uid, normalized, transaction_ref, null, event->>'store', event->>'environment',
            store_product, normalized, event->>'order_id', event->>'purchase_token',
            event->>'currency', nullif(event->>'price_in_purchased_currency', '')::numeric,
            'granted', now(), null,
            coalesce(
              nullif(event->>'purchased_at_ms', '')::bigint::numeric / 1000 * interval '1 second' + timestamptz 'epoch',
              now()
            )
          )
          on conflict(transaction_id) do update
          set status = 'granted', revoked_at = null,
              granted_at = coalesce(public.purchases.granted_at, now()),
              normalized_product = excluded.normalized_product,
              product_id = excluded.product_id,
              store_product_id = excluded.store_product_id,
              environment = coalesce(excluded.environment, public.purchases.environment),
              store = coalesce(excluded.store, public.purchases.store)
          where public.purchases.user_id = excluded.user_id
          returning id into purchase_uuid;

          if purchase_uuid is null then
            result := jsonb_build_object('outcome', 'rejected_account_mismatch');
          else
            entitlement := private.recompute_user_entitlement(uid);
            result := jsonb_build_object(
              'outcome', 'granted', 'purchase_id', purchase_uuid, 'entitlement', entitlement
            );
          end if;
        end if;
      end if;
    elsif event_type in ('CANCELLATION', 'REFUND', 'EXPIRATION') then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('entitlement:' || uid::text, 0)
      );
      update public.purchases
      set status = case when event_type = 'REFUND' then 'refunded' else 'revoked' end,
          revoked_at = now()
      where user_id = uid
        and transaction_id in (
          coalesce(nullif(event->>'transaction_id', ''), transaction_ref),
          coalesce(nullif(event->>'original_transaction_id', ''), transaction_ref)
        );
      get diagnostics affected = row_count;

      if affected = 0 and normalized is not null then
        update public.purchases
        set status = case when event_type = 'REFUND' then 'refunded' else 'revoked' end,
            revoked_at = now()
        where user_id = uid and status = 'granted'
          and coalesce(normalized_product, product_id) = normalized;
        get diagnostics affected = row_count;
      end if;

      entitlement := private.recompute_user_entitlement(uid);
      result := jsonb_build_object(
        'outcome', case
          when affected = 0 then 'purchase_not_found'
          when event_type = 'REFUND' then 'refunded'
          else 'revoked'
        end,
        'affected_purchases', affected,
        'entitlement', entitlement
      );
    else
      result := jsonb_build_object('outcome', 'ignored_event_type');
    end if;
  end if;

  update public.webhook_events
  set processed_at = now(), outcome = result->>'outcome'
  where provider = 'revenuecat' and provider_event_id = event_id;
  return result;
end
$$;
revoke all on function public.process_revenuecat_event(jsonb, text) from public, anon, authenticated;
grant execute on function public.process_revenuecat_event(jsonb, text) to service_role;

-- Repair any chapter rows produced by the previous event-by-event logic.
do $$
declare
  user_uuid uuid;
begin
  for user_uuid in select id from public.users order by id loop
    perform private.recompute_user_entitlement(user_uuid);
  end loop;
end
$$;
