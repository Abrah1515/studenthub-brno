-- Bezpečnější životní cyklus a veřejné číselníkové údaje smluvního feedu brigád.

alter table public.jobs
  add column if not exists position_label text,
  add column if not exists suitability_codes text[] not null default '{}',
  add column if not exists minimum_education_external_id text,
  add column if not exists missing_from_feed_runs smallint not null default 0;

alter table public.jobs
  drop constraint if exists jobs_missing_from_feed_runs_check,
  drop constraint if exists jobs_minimum_education_external_id_check;

alter table public.jobs
  add constraint jobs_missing_from_feed_runs_check check (missing_from_feed_runs between 0 and 3),
  add constraint jobs_minimum_education_external_id_check check (
    minimum_education_external_id is null or minimum_education_external_id in ('1','2','3','6')
  );

alter table public.source_sync_runs
  add column if not exists unchanged_count integer not null default 0 check (unchanged_count >= 0),
  add column if not exists warning_count integer not null default 0 check (warning_count >= 0),
  add column if not exists warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array');

create index if not exists jobs_provider_status_missing_idx
  on public.jobs (provider_key, status, missing_from_feed_runs)
  where provider_key is not null;

update public.content_sources
set notes = 'Testovací XML slouží jen k ověření parseru. Produkční import čeká na ostrý smluvní XML feed.',
    refresh_interval = interval '9 hours',
    updated_at = now()
where id = 'src-fajn-brigady';

comment on column public.jobs.missing_from_feed_runs is
  'Počet po sobě jdoucích úspěšných úplných snapshotů bez nabídky; archivace až při hodnotě 3.';
comment on column public.source_sync_runs.warnings is
  'Strukturované nekritické výstrahy parseru bez zdrojového XML a kontaktních údajů.';
