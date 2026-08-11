begin;
select plan(26);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at
) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ledger-source@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ledger-destination@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now());

select is(
  public.process_revenuecat_event(
    jsonb_build_object(
      'id', 'ledger-grant-30', 'type', 'NON_RENEWING_PURCHASE',
      'app_user_id', '11111111-1111-4111-8111-111111111111',
      'product_id', 'com.thirtynights.nights30', 'transaction_id', 'ledger-transaction-30'
    ), 'hash-ledger-grant-30'
  )->>'outcome',
  'granted',
  '30-night grant is accepted'
);
select is(
  (select plan_state from public.chapters where user_id = '11111111-1111-4111-8111-111111111111' order by started_at desc limit 1),
  'paid30',
  '30-night grant projects paid30'
);
select is(
  public.process_revenuecat_event(
    jsonb_build_object(
      'id', 'ledger-grant-90', 'type', 'NON_RENEWING_PURCHASE',
      'app_user_id', '11111111-1111-4111-8111-111111111111',
      'product_id', 'com.thirtynights.nights90', 'transaction_id', 'ledger-transaction-90'
    ), 'hash-ledger-grant-90'
  )->>'outcome',
  'granted',
  '90-night grant is accepted'
);
select is(
  (select plan_state from public.chapters where user_id = '11111111-1111-4111-8111-111111111111' order by started_at desc limit 1),
  'paid90',
  'the strongest current grant wins'
);
select is(
  (select target_length from public.chapters where user_id = '11111111-1111-4111-8111-111111111111' order by started_at desc limit 1),
  90,
  'the historical schedule reaches 90'
);

insert into public.reports(chapter_id, kind, checkpoint_night, status, report_version)
select id, 'full', 90, 'queued', 'v1'
from public.chapters
where user_id = '11111111-1111-4111-8111-111111111111'
order by started_at desc limit 1;
insert into private.report_jobs(report_id)
select id from public.reports
where chapter_id = (
  select id from public.chapters
  where user_id = '11111111-1111-4111-8111-111111111111'
  order by started_at desc limit 1
) and checkpoint_night = 90;

select is(
  public.process_revenuecat_event(
    jsonb_build_object(
      'id', 'ledger-refund-90', 'type', 'REFUND',
      'app_user_id', '11111111-1111-4111-8111-111111111111',
      'product_id', 'com.thirtynights.nights90', 'transaction_id', 'ledger-transaction-90'
    ), 'hash-ledger-refund-90'
  )->>'outcome',
  'refunded',
  '90-night refund is applied'
);
select is(
  (select plan_state from public.chapters where user_id = '11111111-1111-4111-8111-111111111111' order by started_at desc limit 1),
  'paid30',
  '90-night refund falls back to the still-granted 30-night purchase'
);
select is(
  (select access_through from public.chapters where user_id = '11111111-1111-4111-8111-111111111111' order by started_at desc limit 1),
  30,
  'paid30 fallback grants only nights through 30'
);
select is(
  (select status from private.report_jobs where report_id = (
    select id from public.reports where chapter_id = (
      select id from public.chapters
      where user_id = '11111111-1111-4111-8111-111111111111'
      order by started_at desc limit 1
    ) and checkpoint_night = 90
  )),
  'cancelled',
  'downgrade cancels report work beyond the effective entitlement'
);
select is(
  (select error_code from public.reports where chapter_id = (
    select id from public.chapters
    where user_id = '11111111-1111-4111-8111-111111111111'
    order by started_at desc limit 1
  ) and checkpoint_night = 90),
  'entitlement_revoked',
  'downgrade exposes the canceled report reason'
);

select is(
  public.process_revenuecat_event(
    jsonb_build_object(
      'id', 'ledger-refund-30', 'type', 'REFUND',
      'app_user_id', '11111111-1111-4111-8111-111111111111',
      'product_id', 'com.thirtynights.nights30', 'transaction_id', 'ledger-transaction-30'
    ), 'hash-ledger-refund-30'
  )->>'outcome',
  'refunded',
  '30-night refund is applied'
);
select is(
  (select plan_state from public.chapters where user_id = '11111111-1111-4111-8111-111111111111' order by started_at desc limit 1),
  'trial',
  'no current grants falls back to trial'
);
select is(
  (select access_through from public.chapters where user_id = '11111111-1111-4111-8111-111111111111' order by started_at desc limit 1),
  7,
  'trial fallback grants only the first seven nights'
);
select is(
  (select target_length from public.chapters where user_id = '11111111-1111-4111-8111-111111111111' order by started_at desc limit 1),
  90,
  'fallback does not erase the historical schedule'
);

select is(
  public.process_revenuecat_event(
    jsonb_build_object(
      'id', 'ledger-regrant-30', 'type', 'NON_RENEWING_PURCHASE',
      'app_user_id', '11111111-1111-4111-8111-111111111111',
      'product_id', 'com.thirtynights.nights30', 'transaction_id', 'ledger-transaction-30'
    ), 'hash-ledger-regrant-30'
  )->>'outcome',
  'granted',
  'a store regrant restores the existing ledger row'
);
select is(
  public.process_revenuecat_event(
    jsonb_build_object(
      'id', 'ledger-transfer', 'type', 'TRANSFER',
      'transferred_from', jsonb_build_array('11111111-1111-4111-8111-111111111111', '$RCAnonymousID:ignored'),
      'transferred_to', jsonb_build_array('22222222-2222-4222-8222-222222222222')
    ), 'hash-ledger-transfer'
  )->>'outcome',
  'transferred',
  'an unambiguous permanent-account transfer is applied'
);
select is(
  (select plan_state from public.chapters where user_id = '11111111-1111-4111-8111-111111111111' order by started_at desc limit 1),
  'trial',
  'the transfer source is recomputed to trial'
);
select is(
  (select plan_state from public.chapters where user_id = '22222222-2222-4222-8222-222222222222' order by started_at desc limit 1),
  'paid30',
  'the transfer destination receives the active ledger grant'
);
select is(
  (select user_id from public.purchases where transaction_id = 'ledger-transaction-30'),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'the transferred transaction has one server owner'
);
select is(
  public.process_revenuecat_event(
    jsonb_build_object(
      'id', 'ledger-mismatch', 'type', 'NON_RENEWING_PURCHASE',
      'app_user_id', '11111111-1111-4111-8111-111111111111',
      'product_id', 'com.thirtynights.nights30', 'transaction_id', 'ledger-transaction-30'
    ), 'hash-ledger-mismatch'
  )->>'outcome',
  'rejected_account_mismatch',
  'a grant cannot silently take a transaction from another account'
);
select is(
  (select user_id from public.purchases where transaction_id = 'ledger-transaction-30'),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'a rejected mismatch leaves ownership unchanged'
);

do $$
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":false}',
    true
  );
end
$$;

select lives_ok(
  $$ select public.set_processing_consent('cloud-processing-v2') $$,
  'a permanent account can grant processing consent'
);
select is(
  (select processing_consent_version from public.users where id = '11111111-1111-4111-8111-111111111111'),
  'cloud-processing-v2',
  'the active consent version is durable'
);

insert into public.reports(chapter_id, kind, checkpoint_night, status, report_version)
select id, 'mini', 7, 'queued', 'v1'
from public.chapters
where user_id = '11111111-1111-4111-8111-111111111111'
order by started_at desc limit 1;
insert into private.report_jobs(report_id)
select id from public.reports
where chapter_id = (
  select id from public.chapters
  where user_id = '11111111-1111-4111-8111-111111111111'
  order by started_at desc limit 1
) and checkpoint_night = 7;

select lives_ok(
  $$ select public.set_processing_consent(null) $$,
  'a permanent account can withdraw processing consent'
);
select is(
  (select status from private.report_jobs where report_id = (
    select id from public.reports where chapter_id = (
      select id from public.chapters
      where user_id = '11111111-1111-4111-8111-111111111111'
      order by started_at desc limit 1
    ) and checkpoint_night = 7
  )),
  'cancelled',
  'withdrawal cancels queued report work'
);
select is(
  (select status from public.reports where chapter_id = (
    select id from public.chapters
    where user_id = '11111111-1111-4111-8111-111111111111'
    order by started_at desc limit 1
  ) and checkpoint_night = 7),
  'failed',
  'withdrawal makes the canceled report state visible to the client'
);

select * from finish();
rollback;
