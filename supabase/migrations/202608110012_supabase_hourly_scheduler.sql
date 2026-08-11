-- Hodinový dispatcher pro Vercel Hobby. Tajemství se vkládá odděleně do
-- Supabase Vault pod názvem studenthub_scheduler_secret a nikdy není v migraci.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $migration$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'studenthub-source-sync-hourly';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'studenthub-source-sync-hourly',
    '17 * * * *',
    $command$
      select net.http_get(
        url := 'https://studenthub-brno.vercel.app/api/cron/sync-sources?city=brno',
        headers := jsonb_build_object(
          'x-studenthub-scheduler',
          (select decrypted_secret from vault.decrypted_secrets where name = 'studenthub_scheduler_secret' limit 1)
        ),
        timeout_milliseconds := 55000
      ) as request_id;
    $command$
  );
end
$migration$;
