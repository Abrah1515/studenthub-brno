begin read only;
select jsonb_build_object(
  'migrations', (select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
  'tables', (select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'anon_insert',has_table_privilege('anon',c.oid,'INSERT'),'authenticated_update',has_table_privilege('authenticated',c.oid,'UPDATE'))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
  'policies', (select jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'roles',roles,'operation',cmd,'using',qual,'check',with_check)) from pg_policies where schemaname='public'),
  'security_definer', (select jsonb_agg(jsonb_build_object('name',p.proname,'signature',pg_get_function_identity_arguments(p.oid),'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'search_path',p.proconfig)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef),
  'cron', (select jsonb_agg(jsonb_build_object('id',jobid,'name',jobname,'schedule',schedule,'active',active)) from cron.job),
  'recent_cron', (select jsonb_agg(r) from (select jobid,status,start_time,end_time from cron.job_run_details order by start_time desc limit 12) r),
  'buckets', (select jsonb_agg(jsonb_build_object('id',id,'public',public,'limit',file_size_limit,'types',allowed_mime_types)) from storage.buckets),
  'storage_policies', (select jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'roles',roles,'operation',cmd,'using',qual,'check',with_check)) from pg_policies where schemaname='storage'),
  'publications', (select jsonb_agg(jsonb_build_object('publication',pubname,'table',tablename)) from pg_publication_tables where schemaname='public')
) as audit;
rollback;
