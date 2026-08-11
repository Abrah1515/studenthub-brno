-- Run small batches often enough to absorb temporary backlogs without polling any
-- individual source more frequently than its own next_check_at permits.
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
    'studenthub-source-sync-20min',
    '17,37,57 * * * *',
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

-- Put the newly autonomous VUT connectors at the head of the first production batch.
update public.content_sources
set next_check_at = now() - interval '4 hours',
    sync_status = case when sync_status = 'running' then 'idle' else sync_status end
where id in ('src-vut-fekt', 'src-vut-fch', 'src-vut-fp');
