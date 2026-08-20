create table private.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_normalized text generated always as (lower(btrim(email))) stored,
  platform text not null default 'both'
    check (platform in ('both', 'ios', 'android')),
  status text not null default 'waiting'
    check (status in ('waiting', 'notified', 'unsubscribed')),
  source text not null default 'landing_page'
    check (source = 'landing_page'),
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waitlist_signups_email_length
    check (char_length(email_normalized) between 3 and 254),
  constraint waitlist_signups_email_unique unique (email_normalized)
);

alter table private.waitlist_signups enable row level security;
revoke all on table private.waitlist_signups from public, anon, authenticated;

comment on table private.waitlist_signups is
  'Launch waitlist submissions collected through the public website.';
comment on column private.waitlist_signups.platform is
  'The launch platform the visitor asked to hear about: both, ios, or android.';

create or replace function public.join_waitlist(
  p_email text,
  p_platform text default 'both'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(p_email));
  normalized_platform text := lower(btrim(p_platform));
begin
  if char_length(normalized_email) not between 3 and 254
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  if normalized_platform not in ('both', 'ios', 'android') then
    raise exception 'invalid_platform' using errcode = '22023';
  end if;

  insert into private.waitlist_signups (email, platform)
  values (normalized_email, normalized_platform)
  on conflict (email_normalized) do update
  set platform = excluded.platform,
      status = 'waiting',
      consented_at = now(),
      updated_at = now();
end;
$$;

revoke all on function public.join_waitlist(text, text) from public, anon, authenticated;
grant execute on function public.join_waitlist(text, text) to service_role;

comment on function public.join_waitlist(text, text) is
  'Service-role-only entry point used by the waitlist Edge Function.';
