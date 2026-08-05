-- Forward-only production contract for local-first sync, ledger grants, and report jobs.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.chapters
  add column if not exists target_length integer,
  add column if not exists access_through integer,
  add column if not exists timezone text,
  add column if not exists schedule_version text not null default '2026-08-v1',
  add column if not exists plan_state text not null default 'trial',
  add column if not exists server_revision bigint not null default 1,
  add column if not exists purchase_status text not null default 'none';

update public.chapters set
  target_length = coalesce(target_length, length),
  access_through = coalesce(access_through, length),
  timezone = coalesce(timezone, 'UTC');

alter table public.chapters
  alter column target_length set not null,
  alter column access_through set not null,
  alter column timezone set not null,
  alter column target_length set default 7,
  alter column access_through set default 7,
  alter column timezone set default 'UTC';

alter table public.chapters drop constraint if exists chapters_target_length_check;
alter table public.chapters add constraint chapters_target_length_check check (target_length in (7, 30, 90));
alter table public.chapters drop constraint if exists chapters_access_through_check;
alter table public.chapters add constraint chapters_access_through_check check (access_through between 1 and target_length);
alter table public.chapters drop constraint if exists chapters_plan_state_check;
alter table public.chapters add constraint chapters_plan_state_check check (plan_state in ('trial', 'paid30', 'paid90'));
alter table public.chapters drop constraint if exists chapters_purchase_status_check;
alter table public.chapters add constraint chapters_purchase_status_check check (purchase_status in ('none', 'verifying', 'granted', 'refunded', 'revoked'));

alter table public.nights
  add column if not exists client_id uuid,
  add column if not exists expected_local_date date,
  add column if not exists timezone text,
  add column if not exists question_version text not null default '2026-08-v1',
  add column if not exists state text not null default 'future',
  add column if not exists checksum text,
  add column if not exists byte_size bigint,
  add column if not exists visual_seed integer not null default 0;

update public.nights n set
  expected_local_date = coalesce(n.expected_local_date, (c.started_at at time zone c.timezone)::date + (n.index - 1)),
  timezone = coalesce(n.timezone, c.timezone),
  state = case when n.recorded_at is not null then 'sealed' else 'future' end,
  visual_seed = case when n.visual_seed = 0 then abs(hashtext(n.id::text)) else n.visual_seed end
from public.chapters c where c.id = n.chapter_id;

alter table public.nights alter column expected_local_date set not null;
alter table public.nights alter column timezone set not null;
alter table public.nights drop constraint if exists nights_state_check;
alter table public.nights add constraint nights_state_check check (state in ('future', 'today', 'sealed', 'missed', 'revealed'));
alter table public.nights drop constraint if exists nights_byte_size_check;
alter table public.nights add constraint nights_byte_size_check check (byte_size is null or byte_size between 1 and 10485760);
create unique index if not exists nights_client_id_key on public.nights(client_id) where client_id is not null;
create unique index if not exists nights_chapter_expected_date_key on public.nights(chapter_id, expected_local_date);

alter table public.reports
  add column if not exists checkpoint_night integer,
  add column if not exists report_version text not null default 'v1',
  add column if not exists summary text,
  add column if not exists attempts integer not null default 0,
  add column if not exists error_code text,
  add column if not exists trace_id uuid;

update public.reports r set checkpoint_night = coalesce(
  r.checkpoint_night,
  case when r.kind = 'mini' then 7 else c.target_length end
) from public.chapters c where c.id = r.chapter_id;
alter table public.reports alter column checkpoint_night set not null;
alter table public.reports drop constraint if exists reports_checkpoint_night_check;
alter table public.reports add constraint reports_checkpoint_night_check check (checkpoint_night in (7, 30, 60, 90));
alter table public.reports drop constraint if exists reports_chapter_id_kind_key;
create unique index if not exists reports_chapter_checkpoint_key on public.reports(chapter_id, checkpoint_night);

drop trigger if exists on_night_sealed_queue_report on public.nights;
drop function if exists private.queue_report_after_seal();

alter table public.purchases
  add column if not exists store text,
  add column if not exists environment text,
  add column if not exists store_product_id text,
  add column if not exists normalized_product text,
  add column if not exists order_id text,
  add column if not exists purchase_token text,
  add column if not exists currency text,
  add column if not exists price numeric(12, 4),
  add column if not exists status text not null default 'granted',
  add column if not exists granted_at timestamptz;
alter table public.purchases alter column amount_usd drop not null;
alter table public.purchases drop constraint if exists purchases_status_check;
alter table public.purchases add constraint purchases_status_check check (status in ('pending', 'granted', 'refunded', 'revoked'));

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(), provider text not null, provider_event_id text not null,
  payload_hash text not null, event_type text not null, received_at timestamptz not null default now(),
  processed_at timestamptz, outcome text, unique(provider, provider_event_id)
);
alter table public.webhook_events enable row level security;
revoke all on table public.webhook_events from public, anon, authenticated;

create table if not exists public.deletion_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.users(id) on delete set null,
  user_hash text not null, requested_at timestamptz not null default now(), completed_at timestamptz,
  status text not null default 'requested' check (status in ('requested','processing','complete','failed')),
  error_code text
);
alter table public.deletion_requests enable row level security;
revoke all on table public.deletion_requests from public, anon, authenticated;

create table if not exists private.client_operations (
  operation_id uuid primary key, user_id uuid not null, payload_hash text not null,
  result jsonb not null, created_at timestamptz not null default now()
);
create table if not exists private.transcript_segments (
  id uuid primary key default gen_random_uuid(), night_id uuid not null references public.nights(id) on delete cascade,
  start_ms integer not null check (start_ms >= 0), end_ms integer not null check (end_ms > start_ms),
  text text not null, confidence numeric, language text, speaker text, model_version text not null,
  created_at timestamptz not null default now()
);
create table if not exists private.report_jobs (
  id uuid primary key default gen_random_uuid(), report_id uuid not null unique references public.reports(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','leased','retry','complete','failed','cancelled')),
  attempts integer not null default 0, lease_until timestamptz, next_attempt_at timestamptz not null default now(),
  error_code text, model_version text, prompt_version text, trace_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
revoke all on all tables in schema private from public, anon, authenticated;

drop policy if exists nights_update_own on public.nights;
revoke update on table public.nights from authenticated;
drop policy if exists users_update_own on public.users;
revoke update on table public.users from authenticated;

create policy recordings_permanent_account_only on storage.objects as restrictive
for all to authenticated
using (bucket_id <> 'recordings' or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false)
with check (bucket_id <> 'recordings' or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false);

create or replace function private.question_set_for_index(night_index integer)
returns text language sql immutable set search_path = '' as $$
  select case when night_index <= 30 then 'set_a' when night_index <= 60 then 'set_b' else 'set_c' end
$$;

create or replace function private.ensure_chapter_nights(chapter_uuid uuid, through_night integer)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chapters%rowtype;
begin
  select * into strict c from public.chapters where id = chapter_uuid for update;
  insert into public.nights(chapter_id, index, expected_local_date, timezone, question_id, question_version, state, sealed, visual_seed)
  select c.id, i, (c.started_at at time zone c.timezone)::date + (i - 1), c.timezone,
    private.question_set_for_index(i) || '_' || lpad((((i - 1) % 30) + 1)::text, 2, '0'),
    c.schedule_version, 'future', true, abs(hashtext(c.id::text || ':' || i::text))
  from generate_series(1, through_night) i
  on conflict (chapter_id, index) do nothing;
end $$;
revoke all on function private.ensure_chapter_nights(uuid, integer) from public, anon, authenticated;

create or replace function private.sync_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare provider text; trial_chapter_id uuid;
begin
  provider := case when new.is_anonymous then 'anonymous'
    when coalesce(new.raw_app_meta_data->>'provider','') in ('email','google','apple') then new.raw_app_meta_data->>'provider'
    else 'email' end;
  insert into public.users(id,email,auth_provider,apple_private_relay)
  values (new.id,new.email,provider,provider='apple' and coalesce(new.email,'') like '%@privaterelay.appleid.com')
  on conflict(id) do update set email=excluded.email, auth_provider=excluded.auth_provider,
    apple_private_relay=excluded.apple_private_relay;
  if not exists(select 1 from public.chapters where user_id=new.id) then
    insert into public.chapters(user_id,length,target_length,access_through,question_set,timezone,plan_state,purchase_status)
    values(new.id,7,7,7,'set_a','UTC','trial','none') returning id into trial_chapter_id;
    perform private.ensure_chapter_nights(trial_chapter_id,7);
  end if;
  return new;
end $$;
revoke all on function private.sync_auth_user() from public, anon, authenticated;

create or replace function public.initialize_chapter_schedule(timezone_name text, local_start_date date)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); c public.chapters%rowtype;
begin
  if uid is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=timezone_name) then raise exception 'invalid schedule identity or timezone'; end if;
  select * into strict c from public.chapters where user_id=uid and completed_at is null order by started_at desc limit 1 for update;
  if exists(select 1 from public.nights where chapter_id=c.id and recorded_at is not null) then return; end if;
  update public.chapters set timezone=timezone_name,started_at=(local_start_date::timestamp at time zone timezone_name),server_revision=server_revision+1 where id=c.id;
  update public.nights set expected_local_date=local_start_date+(index-1),timezone=timezone_name where chapter_id=c.id;
end $$;
revoke all on function public.initialize_chapter_schedule(text,date) from public,anon,authenticated;
grant execute on function public.initialize_chapter_schedule(text,date) to authenticated;

create or replace function public.sync_sealed_night(operation_id uuid, seal jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); op_hash text; prior jsonb; c public.chapters%rowtype; n public.nights%rowtype; result jsonb;
begin
  if uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  op_hash := encode(extensions.digest(seal::text, 'sha256'), 'hex');
  select result into prior from private.client_operations where client_operations.operation_id = sync_sealed_night.operation_id and user_id = uid;
  if prior is not null then return prior; end if;
  select * into strict c from public.chapters where user_id = uid and completed_at is null order by started_at desc limit 1 for update;
  if (seal->>'index')::integer > c.access_through then raise exception 'night is not granted' using errcode = '42501'; end if;
  if (seal->>'durationSec')::integer not between 1 and 300 then raise exception 'invalid duration'; end if;
  perform private.ensure_chapter_nights(c.id, c.access_through);
  select * into strict n from public.nights where chapter_id = c.id and index = (seal->>'index')::integer for update;
  if n.recorded_at is not null and n.client_id is distinct from (seal->>'nightId')::uuid then raise exception 'night already sealed'; end if;
  update public.nights set
    client_id = coalesce(client_id, (seal->>'nightId')::uuid), recorded_at = (seal->>'recordedAt')::timestamptz,
    recorded_hour = (seal->>'recordedHour')::integer, duration_sec = (seal->>'durationSec')::integer,
    checksum = seal->>'checksum', byte_size = (seal->>'byteSize')::bigint, state = 'sealed'
  where id = n.id;
  update public.chapters set server_revision = server_revision + 1 where id = c.id;
  result := jsonb_build_object('chapter_id', c.id, 'night_id', n.id);
  insert into private.client_operations(operation_id, user_id, payload_hash, result) values (operation_id, uid, op_hash, result)
  on conflict (operation_id) do nothing;
  return result;
end $$;
revoke all on function public.sync_sealed_night(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sync_sealed_night(uuid, jsonb) to authenticated;

create or replace function private.queue_eligible_reports(chapter_uuid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.chapters%rowtype; checkpoint integer; latest_backed integer;
begin
  select * into strict c from public.chapters where id = chapter_uuid;
  select coalesce(max(index), 0) into latest_backed from public.nights where chapter_id = c.id and storage_path is not null;
  foreach checkpoint in array array[7,30,60,90] loop
    if checkpoint <= c.target_length and (latest_backed >= checkpoint or exists(
      select 1 from public.nights where chapter_id=c.id and index=checkpoint and expected_local_date < (now() at time zone c.timezone)::date
    )) and exists(
      select 1 from public.nights where chapter_id=c.id and index<=checkpoint and storage_path is not null
    ) and not exists(
      select 1 from public.nights where chapter_id=c.id and index<=checkpoint and recorded_at is not null and storage_path is null
    ) then
      insert into public.reports(chapter_id, kind, checkpoint_night, status, report_version)
      values (c.id, case when checkpoint = 7 then 'mini' else 'full' end, checkpoint, 'queued', 'v1')
      on conflict (chapter_id, checkpoint_night) do nothing;
      insert into private.report_jobs(report_id)
      select id from public.reports where chapter_id = c.id and checkpoint_night = checkpoint
      on conflict (report_id) do nothing;
    end if;
  end loop;
end $$;
revoke all on function private.queue_eligible_reports(uuid) from public,anon,authenticated;

create or replace function public.reconcile_chapter_state()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); c public.chapters%rowtype;
begin
  if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into strict c from public.chapters where user_id=uid and completed_at is null order by started_at desc limit 1 for update;
  update public.nights set state='missed' where chapter_id=c.id and index<=c.access_through and recorded_at is null
    and expected_local_date < (now() at time zone c.timezone)::date;
  perform private.queue_eligible_reports(c.id);
end $$;
revoke all on function public.reconcile_chapter_state() from public,anon,authenticated;
grant execute on function public.reconcile_chapter_state() to authenticated;

create or replace function public.attach_night_audio(night_id uuid, storage_path text, expected_checksum text, expected_byte_size bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n public.nights%rowtype; object_row jsonb; object_size bigint; object_checksum text;
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then raise exception 'permanent account required' using errcode = '42501'; end if;
  select nights.* into strict n from public.nights nights join public.chapters c on c.id = nights.chapter_id
  where c.user_id = uid and (nights.id = attach_night_audio.night_id or nights.client_id = attach_night_audio.night_id) for update;
  if storage_path !~ ('^' || uid::text || '/[0-9a-f-]+/[0-9a-f-]+\\.m4a$') then raise exception 'invalid object path'; end if;
  select to_jsonb(o) into object_row from storage.objects o where o.bucket_id = 'recordings' and o.name = storage_path;
  if object_row is null then raise exception 'uploaded object not found'; end if;
  object_size := coalesce((object_row->'metadata'->>'size')::bigint, (object_row->>'size')::bigint);
  object_checksum := coalesce(object_row->'user_metadata'->>'sha256', object_row->'metadata'->>'sha256');
  if object_size is distinct from expected_byte_size then raise exception 'object size mismatch'; end if;
  if object_checksum is not null and object_checksum <> expected_checksum then raise exception 'object checksum mismatch'; end if;
  if n.checksum is distinct from expected_checksum or n.byte_size is distinct from expected_byte_size then raise exception 'sealed metadata mismatch'; end if;
  update public.nights set storage_path = attach_night_audio.storage_path where id = n.id;
  perform private.queue_eligible_reports(n.chapter_id);
end $$;
revoke all on function public.attach_night_audio(uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function public.attach_night_audio(uuid, text, text, bigint) to authenticated;

create or replace function public.retry_report(report_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); rid uuid;
begin
  select r.id into strict rid from public.reports r join public.chapters c on c.id = r.chapter_id
  where r.id = retry_report.report_id and c.user_id = uid and r.status = 'failed' for update;
  update public.reports set status = 'queued', error_code = null, trace_id = null where id = rid;
  insert into private.report_jobs(report_id) values (rid)
  on conflict (report_id) do update set status = 'queued', next_attempt_at = now(), error_code = null, updated_at = now();
end $$;
revoke all on function public.retry_report(uuid) from public, anon, authenticated;
grant execute on function public.retry_report(uuid) to authenticated;

create or replace function public.process_revenuecat_event(event jsonb, payload_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare event_id text := event->>'id'; event_type text := upper(event->>'type'); uid uuid;
  store_product text := event->>'product_id'; normalized text; target integer; transaction_ref text;
  purchase_uuid uuid; chapter_uuid uuid; existing_outcome text; result jsonb;
begin
  if current_user not in ('service_role','postgres','supabase_admin') then raise exception 'server role required' using errcode='42501'; end if;
  if event_id is null or event_type is null then raise exception 'invalid event'; end if;
  select outcome into existing_outcome from public.webhook_events where provider='revenuecat' and provider_event_id=event_id;
  if existing_outcome is not null then return jsonb_build_object('outcome',existing_outcome,'duplicate',true); end if;
  insert into public.webhook_events(provider,provider_event_id,payload_hash,event_type)
  values('revenuecat',event_id,payload_hash,event_type) on conflict(provider,provider_event_id) do nothing;
  uid := nullif(event->>'app_user_id','')::uuid;
  normalized := case store_product
    when 'com.thirtynights.nights30' then 'nights_30' when 'nights_30' then 'nights_30'
    when 'com.thirtynights.nights90' then 'nights_90' when 'nights_90' then 'nights_90' else null end;
  target := case normalized when 'nights_30' then 30 when 'nights_90' then 90 end;
  transaction_ref := coalesce(nullif(event->>'transaction_id',''),nullif(event->>'original_transaction_id',''),event_id);
  if uid is null or normalized is null then
    update public.webhook_events set processed_at=now(),outcome='ignored_invalid_identity_or_product' where provider_event_id=event_id and provider='revenuecat';
    return jsonb_build_object('outcome','ignored_invalid_identity_or_product');
  end if;
  if not exists(select 1 from public.users where id=uid and auth_provider<>'anonymous') then raise exception 'recoverable account required'; end if;

  if event_type in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL') then
    insert into public.purchases(user_id,product_id,transaction_id,amount_usd,store,environment,store_product_id,
      normalized_product,order_id,purchase_token,currency,price,status,granted_at,purchased_at)
    values(uid,normalized,transaction_ref,null,event->>'store',event->>'environment',store_product,normalized,
      event->>'order_id',event->>'purchase_token',event->>'currency',nullif(event->>'price_in_purchased_currency','')::numeric,
      'granted',now(),coalesce(nullif(event->>'purchased_at_ms','')::bigint::numeric/1000 * interval '1 second' + timestamptz 'epoch',now()))
    on conflict(transaction_id) do update set status='granted',revoked_at=null,granted_at=coalesce(public.purchases.granted_at,now())
    returning id into purchase_uuid;
    select id into chapter_uuid from public.chapters where user_id=uid and completed_at is null order by started_at desc limit 1 for update;
    if chapter_uuid is null then
      insert into public.chapters(user_id,length,target_length,access_through,question_set,timezone,plan_state,purchase_status,purchase_id)
      values(uid,target,target,target,'set_a','UTC',case when target=90 then 'paid90' else 'paid30' end,'granted',purchase_uuid)
      returning id into chapter_uuid;
    else
      update public.chapters set length=greatest(length,target),target_length=greatest(target_length,target),
        access_through=greatest(access_through,target),plan_state=case when greatest(target_length,target)=90 then 'paid90' else 'paid30' end,
        purchase_status='granted',purchase_id=purchase_uuid,server_revision=server_revision+1 where id=chapter_uuid;
    end if;
    perform private.ensure_chapter_nights(chapter_uuid,target);
    result:=jsonb_build_object('outcome','granted','chapter_id',chapter_uuid,'target_length',target);
  elsif event_type in ('CANCELLATION','REFUND','EXPIRATION') then
    update public.purchases set status=case when event_type='REFUND' then 'refunded' else 'revoked' end,revoked_at=now()
    where user_id=uid and (transaction_id=transaction_ref or store_product_id=store_product) returning id into purchase_uuid;
    update public.chapters c set purchase_status=case when event_type='REFUND' then 'refunded' else 'revoked' end,
      access_through=greatest(7,coalesce((select max(index) from public.nights where chapter_id=c.id and recorded_at is not null),7)),
      server_revision=server_revision+1 where c.user_id=uid and c.purchase_id=purchase_uuid;
    result:=jsonb_build_object('outcome','revoked');
  else result:=jsonb_build_object('outcome','ignored_event_type');
  end if;
  update public.webhook_events set processed_at=now(),outcome=result->>'outcome' where provider='revenuecat' and provider_event_id=event_id;
  return result;
end $$;
revoke all on function public.process_revenuecat_event(jsonb,text) from public,anon,authenticated;
grant execute on function public.process_revenuecat_event(jsonb,text) to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('report-audio','report-audio',false,52428800,array['audio/m4a','audio/mp4','audio/mpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy report_audio_select_own on storage.objects for select to authenticated using (
  bucket_id = 'report-audio' and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false
);

-- Explicit Data API grants; newer projects do not expose public objects implicitly.
revoke all on table public.webhook_events from anon, authenticated;
revoke all on table public.deletion_requests from anon, authenticated;
grant all on table public.webhook_events, public.deletion_requests to service_role;
grant select on table public.users to authenticated;
grant select, insert, update, delete on table public.devices to authenticated;
grant select on table public.purchases, public.chapters, public.nights, public.reports to authenticated;
