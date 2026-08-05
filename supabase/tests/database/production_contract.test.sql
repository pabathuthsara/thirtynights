begin;
select plan(26);

select has_column('public','chapters','target_length','chapters expose target_length');
select has_column('public','chapters','access_through','chapters expose verified access');
select has_column('public','nights','expected_local_date','nights store canonical dates');
select has_column('public','nights','client_id','server maps immutable client night IDs');
select has_column('public','reports','checkpoint_night','reports use checkpoint semantics');
select has_table('private','report_jobs','report jobs are outside the exposed public schema');
select has_table('private','transcript_segments','transcripts are outside the exposed public schema');
select has_table('public','webhook_events','webhook events support replay protection');
select has_function('public','sync_sealed_night',array['uuid','jsonb'],'seal RPC exists');
select has_function('public','attach_night_audio',array['uuid','text','text','bigint'],'attachment RPC exists');
select has_function('public','retry_report',array['uuid'],'retry RPC exists');
select has_function('public','process_revenuecat_event',array['jsonb','text'],'server ledger RPC exists');
select has_function('public','initialize_chapter_schedule',array['text','date'],'schedule initialization RPC exists');
select has_function('public','reconcile_chapter_state',array[]::text[],'chapter reconciliation RPC exists');
select ok((select relrowsecurity from pg_class where oid='public.nights'::regclass),'nights RLS is enabled');
select ok((select relrowsecurity from pg_class where oid='public.reports'::regclass),'reports RLS is enabled');
select ok((select relrowsecurity from pg_class where oid='public.webhook_events'::regclass),'webhook events RLS is enabled');
select ok(not has_table_privilege('authenticated','public.nights','UPDATE'),'mobile role cannot update night rows directly');
select ok(not has_table_privilege('authenticated','public.purchases','INSERT'),'mobile role cannot insert purchases');
select ok(not has_table_privilege('authenticated','public.reports','UPDATE'),'mobile role cannot publish reports');
select ok(not has_table_privilege('authenticated','public.webhook_events','SELECT'),'mobile role cannot read webhook payload metadata');
select ok(not has_table_privilege('authenticated','public.deletion_requests','SELECT'),'mobile role cannot read deletion audit rows');
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

select * from finish();
rollback;
