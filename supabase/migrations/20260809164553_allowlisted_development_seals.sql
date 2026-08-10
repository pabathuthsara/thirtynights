-- Permit explicitly allow-listed developer accounts to exercise an entire
-- chapter in a development build on one civil day. Normal accounts retain the
-- immutable scheduled-date check. Membership is service-role managed only.

create table if not exists private.developer_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

revoke all on table private.developer_accounts from public, anon, authenticated;
grant select, insert, delete on table private.developer_accounts to service_role;

create or replace function public.sync_sealed_night(operation_id uuid, seal jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  is_developer boolean := false;
  op_hash text;
  prior_hash text;
  prior_result jsonb;
  c public.chapters%rowtype;
  n public.nights%rowtype;
  requested_night_id uuid;
  requested_index integer;
  requested_recorded_at timestamptz;
  requested_recorded_hour integer;
  requested_duration integer;
  requested_checksum text;
  requested_byte_size bigint;
  result jsonb;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select exists (
    select 1 from private.developer_accounts where user_id = uid
  ) into is_developer;

  begin
    requested_night_id := (seal->>'nightId')::uuid;
    requested_index := (seal->>'index')::integer;
    requested_recorded_at := (seal->>'recordedAt')::timestamptz;
    requested_recorded_hour := (seal->>'recordedHour')::integer;
    requested_duration := (seal->>'durationSec')::integer;
    requested_checksum := lower(seal->>'checksum');
    requested_byte_size := (seal->>'byteSize')::bigint;
  exception when others then
    raise exception 'invalid seal payload';
  end;

  if requested_night_id is null
    or requested_index is null or requested_index not between 1 and 90
    or requested_recorded_at is null
    or requested_recorded_hour is null or requested_recorded_hour not between 0 and 23
    or requested_duration is null or requested_duration not between 1 and 300
    or requested_checksum is null or requested_checksum !~ '^[0-9a-f]{64}$'
    or requested_byte_size is null or requested_byte_size not between 1 and 10485760
  then
    raise exception 'invalid seal payload';
  end if;

  op_hash := encode(extensions.digest(seal::text, 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(uid::text || ':' || operation_id::text, 0)
  );
  select payload_hash, client_operations.result
    into prior_hash, prior_result
  from private.client_operations
  where client_operations.user_id = uid
    and client_operations.operation_id = sync_sealed_night.operation_id;

  if prior_result is not null then
    if prior_hash is distinct from op_hash then
      raise exception 'operation payload mismatch';
    end if;
    return prior_result;
  end if;

  select * into strict c
  from public.chapters
  where user_id = uid and completed_at is null
  order by started_at desc
  limit 1
  for update;

  if requested_index > c.access_through then
    raise exception 'night is not granted' using errcode = '42501';
  end if;

  perform private.ensure_chapter_nights(c.id, c.access_through);
  select * into strict n
  from public.nights
  where chapter_id = c.id and index = requested_index
  for update;

  if not is_developer and (
    (requested_recorded_at at time zone n.timezone)::date <> n.expected_local_date
    or extract(hour from requested_recorded_at at time zone n.timezone)::integer <> requested_recorded_hour
  ) then
    raise exception 'recording does not match scheduled local time';
  end if;

  if n.recorded_at is not null then
    if n.client_id is distinct from requested_night_id
      or n.recorded_at is distinct from requested_recorded_at
      or n.recorded_hour is distinct from requested_recorded_hour
      or n.duration_sec is distinct from requested_duration
      or n.checksum is distinct from requested_checksum
      or n.byte_size is distinct from requested_byte_size
    then
      raise exception 'night already sealed';
    end if;
  else
    update public.nights set
      client_id = requested_night_id,
      recorded_at = requested_recorded_at,
      recorded_hour = requested_recorded_hour,
      duration_sec = requested_duration,
      checksum = requested_checksum,
      byte_size = requested_byte_size,
      state = 'sealed'
    where id = n.id;

    update public.chapters
    set server_revision = server_revision + 1
    where id = c.id;
  end if;

  result := jsonb_build_object('chapter_id', c.id, 'night_id', n.id);
  insert into private.client_operations(operation_id, user_id, payload_hash, result)
  values (operation_id, uid, op_hash, result);
  return result;
end
$$;

revoke all on function public.sync_sealed_night(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sync_sealed_night(uuid, jsonb) to authenticated;
