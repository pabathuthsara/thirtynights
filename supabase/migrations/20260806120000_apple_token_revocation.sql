-- Storage for the Sign in with Apple refresh token.
--
-- App Review guideline 5.1.1(v) requires that deleting an account also revokes
-- the tokens Apple issued, and Apple's revoke endpoint needs a refresh token.
-- The authorization code the device receives is single-use and expires in
-- minutes, so the exchange has to happen at sign-in and the result has to
-- survive until deletion.
--
-- This is bearer credential material. It lives in `private`, is never exposed
-- through the Data API, and no client role can read it. The two functions below
-- are the entire interface, both are service_role-only, and neither is
-- reachable from an authenticated client — so the Edge Functions can reach the
-- token without `private` being added to the PostgREST schema allowlist.
--
-- The row is deliberately not deleted after a successful revoke: the cascade
-- from auth.users does that a moment later, when the account itself goes. That
-- ordering is what makes a failed revoke retryable instead of silently skipped.

create table if not exists private.apple_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  linked_at timestamptz not null default now()
);

-- No role is granted anything on the table itself, service_role included. The
-- two security-definer functions are the only way in or out, which keeps this
-- consistent with how `process_revenuecat_event` reaches its ledger.
revoke all on private.apple_identities from public, anon, authenticated;

comment on table private.apple_identities is
  'Sign in with Apple refresh tokens, held solely to satisfy the token revocation required by App Review guideline 5.1.1(v). Service role only.';

-- Re-signing in on a new device issues a fresh token; the newest is the one
-- Apple honours, so this overwrites rather than accumulating.
create or replace function public.store_apple_refresh_token(target_user uuid, token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('service_role','postgres','supabase_admin') then
    raise exception 'server role required' using errcode = '42501';
  end if;
  if target_user is null or coalesce(token, '') = '' then
    raise exception 'target_user and token are required';
  end if;
  insert into private.apple_identities (user_id, refresh_token, linked_at)
  values (target_user, token, now())
  on conflict (user_id) do update
    set refresh_token = excluded.refresh_token,
        linked_at = excluded.linked_at;
end
$$;

revoke all on function public.store_apple_refresh_token(uuid, text) from public, anon, authenticated;
grant execute on function public.store_apple_refresh_token(uuid, text) to service_role;

-- Returns null when the account never used Sign in with Apple, which is the
-- signal to skip revocation entirely. Reading does not consume: revoking twice
-- is harmless (Apple answers 200 for a token it no longer knows), whereas a
-- consumed-then-failed revoke would leave a retry with nothing to send.
create or replace function public.get_apple_refresh_token(target_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
begin
  if current_user not in ('service_role','postgres','supabase_admin') then
    raise exception 'server role required' using errcode = '42501';
  end if;
  select refresh_token into token from private.apple_identities where user_id = target_user;
  return token;
end
$$;

revoke all on function public.get_apple_refresh_token(uuid) from public, anon, authenticated;
grant execute on function public.get_apple_refresh_token(uuid) to service_role;
