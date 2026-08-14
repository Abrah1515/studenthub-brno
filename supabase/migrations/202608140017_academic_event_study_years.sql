alter table public.academic_events
  add column if not exists study_years smallint[] null;

alter table public.academic_events
  drop constraint if exists academic_events_study_years_check;

alter table public.academic_events
  add constraint academic_events_study_years_check
  check (study_years is null or study_years <@ array[1, 2, 3, 4, 5, 6]::smallint[]);

create index if not exists academic_events_study_years_idx
  on public.academic_events using gin (study_years);

comment on column public.academic_events.study_years is
  'Explicitně uvedené ročníky 1–6. NULL nebo prázdné pole znamená společnou událost.';
