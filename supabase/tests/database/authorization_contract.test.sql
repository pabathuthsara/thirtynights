begin;
select plan(23);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at
) values
  ('31111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rpc-owner@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now()),
  ('32222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rpc-other@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now());

select is_empty(
  $$
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef
      and n.nspname in ('public', 'private')
      and p.proname in (
        'sync_auth_user', 'queue_report_after_seal', 'ensure_chapter_nights',
        'queue_eligible_reports', 'has_processing_consent', 'recompute_user_entitlement',
        'enforce_transcript_processing_consent', 'initialize_chapter_schedule',
        'sync_sealed_night', 'reconcile_chapter_state', 'attach_night_audio',
        'retry_report', 'set_processing_consent', 'process_revenuecat_event',
        'store_apple_refresh_token', 'get_apple_refresh_token'
      )
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, array[]::text[])) setting
        where setting like 'search_path=%'
      )
  $$,
  'every application SECURITY DEFINER function fixes its search path'
);

select is_empty(
  $$
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef and n.nspname in ('public', 'private')
      and has_function_privilege('anon', p.oid, 'execute')
  $$,
  'anonymous requests cannot execute privileged application functions'
);

select is_empty(
  $$
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef and n.nspname = 'private'
      and has_function_privilege('authenticated', p.oid, 'execute')
  $$,
  'authenticated clients cannot execute private privileged helpers'
);

select ok(
  not has_function_privilege('authenticated', 'public.process_revenuecat_event(jsonb,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.store_apple_refresh_token(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_apple_refresh_token(uuid)', 'execute'),
  'server-only SECURITY DEFINER functions reject the mobile role'
);

select ok(has_function_privilege('authenticated', 'public.initialize_chapter_schedule(text,date)', 'execute'), 'schedule RPC is available to authenticated owners');
select ok(has_function_privilege('authenticated', 'public.reconcile_chapter_state()', 'execute'), 'reconciliation RPC is available to authenticated owners');
select ok(has_function_privilege('authenticated', 'public.sync_sealed_night(uuid,jsonb)', 'execute'), 'seal RPC is available to authenticated owners');
select ok(has_function_privilege('authenticated', 'public.attach_night_audio(uuid,text,text,bigint)', 'execute'), 'attachment RPC is available to authenticated owners');
select ok(has_function_privilege('authenticated', 'public.retry_report(uuid)', 'execute'), 'retry RPC is available to authenticated owners');
select ok(has_function_privilege('authenticated', 'public.set_processing_consent(text)', 'execute'), 'consent RPC is available to authenticated owners');

select set_config('request.jwt.claim.sub', '31111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"31111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":false}',
  true
);

set local role authenticated;
select lives_ok(
  $$ select public.initialize_chapter_schedule('Asia/Colombo', date '2026-08-18') $$,
  'an authenticated owner can initialize their own schedule'
);
reset role;
select is(
  (select timezone from public.chapters where user_id = '31111111-1111-4111-8111-111111111111'),
  'Asia/Colombo',
  'schedule initialization changes the owner chapter'
);
select is(
  (select timezone from public.chapters where user_id = '32222222-2222-4222-8222-222222222222'),
  'UTC',
  'schedule initialization does not change another user chapter'
);

set local role authenticated;
select lives_ok(
  $$ select public.set_processing_consent('cloud-processing-v2') $$,
  'an authenticated permanent owner can grant processing consent'
);
reset role;
select is(
  (select processing_consent_version from public.users where id = '31111111-1111-4111-8111-111111111111'),
  'cloud-processing-v2',
  'consent is stored for the authenticated owner'
);
select is(
  (select processing_consent_version from public.users where id = '32222222-2222-4222-8222-222222222222'),
  null,
  'consent never crosses into another user row'
);

update public.nights n
set state = 'future', expected_local_date = current_date - 1
from public.chapters c
where c.id = n.chapter_id and n.index = 1
  and c.user_id in (
    '31111111-1111-4111-8111-111111111111',
    '32222222-2222-4222-8222-222222222222'
  );

set local role authenticated;
select lives_ok(
  $$ select public.reconcile_chapter_state() $$,
  'an authenticated owner can reconcile their own chapter'
);
reset role;
select is(
  (select n.state from public.nights n join public.chapters c on c.id = n.chapter_id
   where c.user_id = '31111111-1111-4111-8111-111111111111' and n.index = 1),
  'missed',
  'reconciliation updates the owner night'
);
select is(
  (select n.state from public.nights n join public.chapters c on c.id = n.chapter_id
   where c.user_id = '32222222-2222-4222-8222-222222222222' and n.index = 1),
  'future',
  'reconciliation leaves another user night unchanged'
);

insert into public.reports(chapter_id, kind, checkpoint_night, status, report_version)
select id, 'mini', 7, 'failed', 'v1'
from public.chapters
where user_id in (
  '31111111-1111-4111-8111-111111111111',
  '32222222-2222-4222-8222-222222222222'
);

set local role authenticated;
select lives_ok(
  $$
    select public.retry_report(
      (select r.id from public.reports r join public.chapters c on c.id = r.chapter_id
       where c.user_id = '31111111-1111-4111-8111-111111111111' and r.checkpoint_night = 7)
    )
  $$,
  'an authenticated owner can retry their own failed report'
);
reset role;
select is(
  (select r.status from public.reports r join public.chapters c on c.id = r.chapter_id
   where c.user_id = '31111111-1111-4111-8111-111111111111' and r.checkpoint_night = 7),
  'queued',
  'the owner report is queued'
);
set local role authenticated;
select throws_ok(
  $$
    select public.retry_report(
      (select r.id from public.reports r join public.chapters c on c.id = r.chapter_id
       where c.user_id = '32222222-2222-4222-8222-222222222222' and r.checkpoint_night = 7)
    )
  $$,
  'P0002',
  'query returned no rows',
  'an authenticated owner cannot retry another user report'
);
reset role;
select is(
  (select r.status from public.reports r join public.chapters c on c.id = r.chapter_id
   where c.user_id = '32222222-2222-4222-8222-222222222222' and r.checkpoint_night = 7),
  'failed',
  'a rejected cross-user retry leaves the other report unchanged'
);

select * from finish();
rollback;
