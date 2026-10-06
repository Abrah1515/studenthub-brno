-- WEDOS blocks external pg_cron HTTP calls to the public domain. Vercel now
-- invokes the protected review route internally once per day, so only the
-- superseded calendar-review jobs are removed here.
do $migration$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'studenthub-academic-calendar-ai-review-daily'
       or jobname like 'studenthub-academic-calendar-review-%'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end
$migration$;
