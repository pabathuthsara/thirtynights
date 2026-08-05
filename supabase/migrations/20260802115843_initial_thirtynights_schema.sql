create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  auth_provider text not null default 'anonymous'
    check (auth_provider in ('email', 'google', 'apple', 'anonymous')),
  apple_private_relay boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  push_token text,
  last_seen_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  product_id text not null check (product_id in ('nights_30', 'nights_90')),
  transaction_id text not null unique,
  purchased_at timestamptz not null default now(),
  revoked_at timestamptz,
  amount_usd numeric(8, 2) not null check (amount_usd >= 0)
);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  length integer not null check (length in (7, 30, 90)),
  question_set text not null check (question_set in ('set_a', 'set_b', 'set_c')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  purchase_id uuid references public.purchases(id) on delete restrict
);

create table public.nights (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  index integer not null check (index between 1 and 90),
  question_id text not null,
  recorded_at timestamptz,
  recorded_hour integer check (recorded_hour between 0 and 23),
  duration_sec integer check (duration_sec between 1 and 300),
  local_path text,
  storage_path text,
  transcript text,
  sealed boolean not null default true,
  revealed_at timestamptz,
  unique (chapter_id, index)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  kind text not null check (kind in ('mini', 'full')),
  status text not null default 'queued' check (status in ('queued', 'running', 'ready', 'failed')),
  audio_path text,
  sections jsonb,
  generated_at timestamptz,
  unique (chapter_id, kind)
);

create index devices_user_id_idx on public.devices(user_id);
create index purchases_user_id_idx on public.purchases(user_id);
create index chapters_user_id_started_at_idx on public.chapters(user_id, started_at desc);
create index nights_chapter_id_recorded_at_idx on public.nights(chapter_id, recorded_at);
create index reports_chapter_id_idx on public.reports(chapter_id);

comment on column public.nights.local_path is
  'Reserved for migration compatibility. Device-local paths must not be sent by the client.';
comment on column public.nights.transcript is
  'Generated only at report time. Never expose through analytics or administrative tooling.';

create or replace function private.sync_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider text;
  trial_chapter_id uuid;
begin
  provider := case
    when new.is_anonymous then 'anonymous'
    when coalesce(new.raw_app_meta_data ->> 'provider', '') in ('email', 'google', 'apple')
      then new.raw_app_meta_data ->> 'provider'
    else 'email'
  end;

  insert into public.users (id, email, auth_provider, apple_private_relay)
  values (
    new.id,
    new.email,
    provider,
    provider = 'apple' and coalesce(new.email, '') like '%@privaterelay.appleid.com'
  )
  on conflict (id) do update
  set email = excluded.email,
      auth_provider = excluded.auth_provider,
      apple_private_relay = excluded.apple_private_relay;

  if not exists (select 1 from public.chapters where user_id = new.id) then
    insert into public.chapters (user_id, length, question_set)
    values (new.id, 7, 'set_a')
    returning id into trial_chapter_id;

    insert into public.nights (chapter_id, index, question_id, sealed)
    select
      trial_chapter_id,
      night_index,
      'set_a_' || lpad(night_index::text, 2, '0'),
      true
    from generate_series(1, 7) as night_index;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_auth_user() from public, anon, authenticated;

create trigger on_auth_user_synced
after insert or update of email, raw_app_meta_data, is_anonymous on auth.users
for each row execute function private.sync_auth_user();

create or replace function private.queue_report_after_seal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chapter_length integer;
  recorded_count integer;
  report_kind text;
begin
  if new.recorded_at is null or old.recorded_at is not null then
    return new;
  end if;

  select length into chapter_length
  from public.chapters
  where id = new.chapter_id;

  select count(*) into recorded_count
  from public.nights
  where chapter_id = new.chapter_id and recorded_at is not null;

  if recorded_count >= chapter_length then
    report_kind := case when chapter_length = 7 then 'mini' else 'full' end;
    insert into public.reports (chapter_id, kind, status)
    values (new.chapter_id, report_kind, 'queued')
    on conflict (chapter_id, kind) do nothing;

    update public.chapters
    set completed_at = coalesce(completed_at, now())
    where id = new.chapter_id;
  end if;

  return new;
end;
$$;

revoke all on function private.queue_report_after_seal() from public, anon, authenticated;

create trigger on_night_sealed_queue_report
after update of recorded_at on public.nights
for each row execute function private.queue_report_after_seal();

alter table public.users enable row level security;
alter table public.devices enable row level security;
alter table public.purchases enable row level security;
alter table public.chapters enable row level security;
alter table public.nights enable row level security;
alter table public.reports enable row level security;

create policy users_select_own on public.users
for select to authenticated
using ((select auth.uid()) = id);

create policy users_update_own on public.users
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy devices_select_own on public.devices
for select to authenticated
using ((select auth.uid()) = user_id);

create policy devices_insert_own on public.devices
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy devices_update_own on public.devices
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy devices_delete_own on public.devices
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy purchases_select_own on public.purchases
for select to authenticated
using ((select auth.uid()) = user_id);

create policy chapters_select_own on public.chapters
for select to authenticated
using ((select auth.uid()) = user_id);

create policy nights_select_own on public.nights
for select to authenticated
using (
  exists (
    select 1 from public.chapters
    where chapters.id = nights.chapter_id
      and chapters.user_id = (select auth.uid())
  )
);

create policy nights_update_own on public.nights
for update to authenticated
using (
  exists (
    select 1 from public.chapters
    where chapters.id = nights.chapter_id
      and chapters.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.chapters
    where chapters.id = nights.chapter_id
      and chapters.user_id = (select auth.uid())
  )
);

create policy reports_select_own on public.reports
for select to authenticated
using (
  exists (
    select 1 from public.chapters
    where chapters.id = reports.chapter_id
      and chapters.user_id = (select auth.uid())
  )
);

revoke all on table public.users, public.devices, public.purchases,
  public.chapters, public.nights, public.reports from anon, authenticated;

grant select, update on table public.users to authenticated;
grant select, insert, update, delete on table public.devices to authenticated;
grant select on table public.purchases, public.chapters, public.reports to authenticated;
grant select, update on table public.nights to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings',
  'recordings',
  false,
  10485760,
  array['audio/m4a', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/wav']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy recordings_select_own on storage.objects
for select to authenticated
using (
  bucket_id = 'recordings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy recordings_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'recordings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy recordings_update_own on storage.objects
for update to authenticated
using (
  bucket_id = 'recordings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'recordings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy recordings_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'recordings'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Existing Auth users are backfilled safely if the project was used before this migration.
insert into public.users (id, email, auth_provider, apple_private_relay, created_at)
select
  id,
  email,
  case
    when is_anonymous then 'anonymous'
    when coalesce(raw_app_meta_data ->> 'provider', '') in ('email', 'google', 'apple')
      then raw_app_meta_data ->> 'provider'
    else 'email'
  end,
  coalesce(raw_app_meta_data ->> 'provider', '') = 'apple'
    and coalesce(email, '') like '%@privaterelay.appleid.com',
  created_at
from auth.users
on conflict (id) do nothing;
