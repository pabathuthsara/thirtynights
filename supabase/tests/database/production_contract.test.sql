begin;
select plan(43);

select has_column('public','chapters','target_length','chapters expose target_length');
select has_column('public','chapters','access_through','chapters expose verified access');
select has_column('public','nights','expected_local_date','nights store canonical dates');
select has_column('public','nights','client_id','server maps immutable client night IDs');
select has_column('public','reports','checkpoint_night','reports use checkpoint semantics');
select has_column('public','users','processing_consent_version','processing consent has durable server state');
select has_column('public','users','processing_consent_granted_at','processing consent records server grant time');
select has_column('public','users','processing_consent_withdrawn_at','processing consent records server withdrawal time');
select has_table('private','report_jobs','report jobs are outside the exposed public schema');
select has_table('private','transcript_segments','transcripts are outside the exposed public schema');
select has_column('private','transcript_segments','report_job_id','transcripts are attributable to a cancellable job');
select has_table('private','processing_consent_events','consent transitions have a private audit trail');
select has_index(
  'private',
  'processing_consent_events',
  'processing_consent_events_user_id_idx',
  'consent audit lookups and user deletion use an indexed foreign key'
);
select has_table('private','developer_accounts','developer cloud testing is explicitly allow-listed');
select has_table('public','webhook_events','webhook events support replay protection');
select has_function('public','sync_sealed_night',array['uuid','jsonb'],'seal RPC exists');
select has_function('public','attach_night_audio',array['uuid','text','text','bigint'],'attachment RPC exists');
select has_function('public','retry_report',array['uuid'],'retry RPC exists');
select has_function('public','process_revenuecat_event',array['jsonb','text'],'server ledger RPC exists');
select has_function('private','recompute_user_entitlement',array['uuid'],'ledger projection helper exists');
select has_function('public','set_processing_consent',array['text'],'consent transition RPC exists');
select has_function('public','initialize_chapter_schedule',array['text','date'],'schedule initialization RPC exists');
select has_function('public','reconcile_chapter_state',array[]::text[],'chapter reconciliation RPC exists');
select like(
  pg_get_functiondef('public.reconcile_chapter_state()'::regprocedure),
  '%when expected_local_date = local_today then ''today''%',
  'chapter reconciliation opens the current local date'
);
select ok((select relrowsecurity from pg_class where oid='public.nights'::regclass),'nights RLS is enabled');
select ok((select relrowsecurity from pg_class where oid='public.reports'::regclass),'reports RLS is enabled');
select ok((select relrowsecurity from pg_class where oid='public.webhook_events'::regclass),'webhook events RLS is enabled');
select ok(not has_table_privilege('authenticated','public.nights','UPDATE'),'mobile role cannot update night rows directly');
select ok(not has_table_privilege('authenticated','public.purchases','INSERT'),'mobile role cannot insert purchases');
select ok(not has_table_privilege('authenticated','public.reports','UPDATE'),'mobile role cannot publish reports');
select ok(not has_table_privilege('authenticated','public.webhook_events','SELECT'),'mobile role cannot read webhook payload metadata');
select ok(not has_table_privilege('authenticated','public.deletion_requests','SELECT'),'mobile role cannot read deletion audit rows');
select ok(not has_table_privilege('authenticated','private.developer_accounts','SELECT'),'mobile role cannot inspect the developer allow-list');
select ok(exists(select 1 from storage.buckets where id='report-audio' and public=false),'report audio bucket is private');
select is(
  (select array_agg(a.attname order by key_column.ordinality)::text[]
   from pg_constraint constraint_row
   cross join lateral unnest(constraint_row.conkey) with ordinality as key_column(attnum, ordinality)
   join pg_attribute a on a.attrelid=constraint_row.conrelid and a.attnum=key_column.attnum
   where constraint_row.conrelid='private.client_operations'::regclass and constraint_row.contype='p'),
  array['user_id','operation_id']::text[],
  'operation idempotency is scoped to the authenticated user'
);
select like(
  pg_get_functiondef('public.sync_sealed_night(uuid,jsonb)'::regprocedure),
  '%recording does not match scheduled local time%',
  'seal RPC checks the recorded local date and hour'
);
select like(
  pg_get_functiondef('public.attach_night_audio(uuid,text,text,bigint)'::regprocedure),
  '%audio attachment is immutable%',
  'audio attachment cannot be replaced with another object path'
);
select like(
  pg_get_functiondef('private.recompute_user_entitlement(uuid)'::regprocedure),
  '%p.status = ''granted''%',
  'entitlement projection reads all currently granted ledger rows'
);
select like(
  pg_get_functiondef('public.process_revenuecat_event(jsonb,text)'::regprocedure),
  '%transferred_to%',
  'RevenueCat transfer aliases are handled explicitly'
);
select like(
  pg_get_functiondef('public.process_revenuecat_event(jsonb,text)'::regprocedure),
  '%rejected_account_mismatch%',
  'transaction ownership mismatches fail closed'
);
select like(
  pg_get_functiondef('private.queue_eligible_reports(uuid)'::regprocedure),
  '%has_processing_consent%',
  'report queueing requires active server consent'
);
select like(
  pg_get_functiondef('public.attach_night_audio(uuid,text,text,bigint)'::regprocedure),
  '%processing consent required%',
  'audio attachment requires active server consent'
);
select ok(
  (select not polpermissive from pg_policy where polname = 'recordings_processing_consent_insert'),
  'recording upload consent is a restrictive Storage policy'
);

select * from finish();
rollback;
