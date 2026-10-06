-- Bezpečná kontrola akademických kalendářů všech zveřejněných měst každých 12 hodin.
-- Běhy jsou rozložené v čase, aby se zbytečně nesčítala zátěž na Vercel a zdrojové weby.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

drop policy if exists "calendar ai staff read brno" on public.academic_calendar_ai_runs;
drop policy if exists "calendar ai staff read cities" on public.academic_calendar_ai_runs;
create policy "calendar ai staff read cities" on public.academic_calendar_ai_runs
for select to authenticated using (public.can_manage_sensitive_city(city_id));

drop policy if exists "calendar ai staff read findings" on public.academic_calendar_ai_findings;
create policy "calendar ai staff read findings" on public.academic_calendar_ai_findings
for select to authenticated using (public.can_manage_sensitive_city(city_id));

drop policy if exists "calendar ai staff read audit" on public.academic_calendar_ai_finding_audit;
create policy "calendar ai staff read audit" on public.academic_calendar_ai_finding_audit
for select to authenticated using (
  exists (
    select 1 from public.academic_calendar_ai_findings finding
    where finding.id = finding_id and public.can_manage_sensitive_city(finding.city_id)
  )
);

do $migration$
declare
  existing_job bigint;
  schedule_row record;
  job_name text;
begin
  select jobid into existing_job from cron.job
  where jobname = 'studenthub-academic-calendar-ai-review-daily';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;

  for schedule_row in
    select * from (values
      ('brno', '41 3,15 * * *'),
      ('praha', '1 4,16 * * *'),
      ('olomouc', '21 4,16 * * *'),
      ('ostrava', '41 4,16 * * *')
    ) as schedules(city_id, cron_expression)
  loop
    job_name := 'studenthub-academic-calendar-review-' || schedule_row.city_id || '-12h';
    existing_job := null;
    select jobid into existing_job from cron.job where jobname = job_name;
    if existing_job is not null then perform cron.unschedule(existing_job); end if;

    perform cron.schedule(
      job_name,
      schedule_row.cron_expression,
      format(
        $command$
          select net.http_get(
            url := 'https://studenthubapp.cz/api/cron/ai-calendar-check?city=%s',
            headers := jsonb_build_object(
              'x-studenthub-scheduler',
              (select decrypted_secret from vault.decrypted_secrets where name = 'studenthub_scheduler_secret' limit 1)
            ),
            timeout_milliseconds := 240000
          ) as request_id;
        $command$,
        schedule_row.city_id
      )
    );
  end loop;
end
$migration$;
