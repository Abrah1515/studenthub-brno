-- Denní kontrola pouze akademických zdrojů Brna. Tajemství je pouze ve Vaultu.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $migration$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job
  where jobname = 'studenthub-academic-calendar-ai-review-daily';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'studenthub-academic-calendar-ai-review-daily',
    '41 3 * * *',
    $command$
      select net.http_get(
        url := 'https://studenthubapp.cz/api/cron/ai-calendar-check?city=brno',
        headers := jsonb_build_object(
          'x-studenthub-scheduler',
          (select decrypted_secret from vault.decrypted_secrets where name = 'studenthub_scheduler_secret' limit 1)
        ),
        timeout_milliseconds := 240000
      ) as request_id;
    $command$
  );
end
$migration$;
