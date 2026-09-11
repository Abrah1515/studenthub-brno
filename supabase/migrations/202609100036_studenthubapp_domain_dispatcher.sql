-- Přesměrování veřejného synchronizačního dispatcheru na hlavní doménu.
-- Tajemství zůstává výhradně v Supabase Vault a tato migrace je idempotentní.
do $migration$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname in ('studenthub-source-sync-hourly', 'studenthub-source-sync-20min')
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  perform cron.schedule(
    'studenthub-source-sync-20min',
    '17,37,57 * * * *',
    $command$
      select net.http_get(
        url := 'https://studenthubapp.cz/api/cron/sync-sources?city=brno',
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
