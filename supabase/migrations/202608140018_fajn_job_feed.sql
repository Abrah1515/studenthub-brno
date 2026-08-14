-- Smluvní XML feed pracovních nabídek. Ostrá URL zůstává výhradně v serverovém prostředí.

alter table public.jobs
  alter column company_name drop not null,
  alter column reward_amount drop not null;

alter table public.jobs
  add column if not exists external_id text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists source_hash text,
  add column if not exists reward_min numeric(12,2),
  add column if not exists reward_max numeric(12,2),
  add column if not exists reward_currency text,
  add column if not exists reward_period text,
  add column if not exists country_external_id text,
  add column if not exists city_external_id text,
  add column if not exists position_external_id text,
  add column if not exists positions_count integer,
  add column if not exists duration_days smallint,
  add column if not exists workplace_address text,
  add column if not exists workload_codes text[] not null default '{}',
  add column if not exists benefit_codes text[] not null default '{}';

alter table public.jobs
  drop constraint if exists jobs_external_id_check,
  drop constraint if exists jobs_source_hash_check,
  drop constraint if exists jobs_reward_range_check,
  drop constraint if exists jobs_reward_currency_check,
  drop constraint if exists jobs_reward_period_check,
  drop constraint if exists jobs_positions_count_check,
  drop constraint if exists jobs_duration_days_check;

alter table public.jobs
  add constraint jobs_external_id_check check (external_id is null or external_id ~ '^[0-9]{1,20}$'),
  add constraint jobs_source_hash_check check (source_hash is null or source_hash ~ '^[a-f0-9]{64}$'),
  add constraint jobs_reward_range_check check (
    (reward_min is null or reward_min > 0) and
    (reward_max is null or reward_max > 0) and
    (reward_min is null or reward_max is null or reward_max >= reward_min)
  ),
  add constraint jobs_reward_currency_check check (reward_currency is null or reward_currency in ('CZK','EUR','USD','GBP')),
  add constraint jobs_reward_period_check check (reward_period is null or reward_period in ('hour','day','shift','month','agreement','fixed','volunteer')),
  add constraint jobs_positions_count_check check (positions_count is null or positions_count > 0),
  add constraint jobs_duration_days_check check (duration_days is null or duration_days between 1 and 366);

alter table public.jobs drop constraint if exists jobs_provider_external_unique;
alter table public.jobs add constraint jobs_provider_external_unique unique (provider_key, external_id);

create index if not exists jobs_provider_last_seen_idx on public.jobs (provider_key, last_seen_at desc);

alter table public.content_sources alter column university_id drop not null;
alter table public.content_sources alter column faculty_id drop not null;
alter table public.content_sources drop constraint if exists content_sources_scope_check;
alter table public.content_sources add constraint content_sources_scope_check check (
  (source_type = 'academic_calendar' and university_id is not null and faculty_id is not null)
  or (source_type <> 'academic_calendar')
);

alter table public.source_sync_runs
  add column if not exists loaded_count integer not null default 0 check (loaded_count >= 0),
  add column if not exists inserted_count integer not null default 0 check (inserted_count >= 0),
  add column if not exists updated_count integer not null default 0 check (updated_count >= 0),
  add column if not exists archived_count integer not null default 0 check (archived_count >= 0),
  add column if not exists rejected_count integer not null default 0 check (rejected_count >= 0);

insert into public.content_sources (
  id, city_id, university_id, faculty_id, source_type, source_url, official_domain,
  format, parser_key, enabled, refresh_interval, monitoring_mode, terms_note, notes,
  confidence, requires_review, next_check_at
) values (
  'src-fajn-brigady', 'brno', null, null, 'job_feed',
  'https://www.fajn-brigady.cz/brigady/brno/', 'media.fajnsprava.cz',
  'xml', 'fajn-v2-xml', true, interval '9 hours', 'automatic_publish',
  'Smluvní XML feed; ostrá adresa je uložena pouze v serverovém prostředí.',
  'Testovací XML se používá jen v testech a nikdy se nepublikuje.',
  1, false, now()
)
on conflict (id) do update set
  city_id = excluded.city_id,
  university_id = null,
  faculty_id = null,
  source_type = excluded.source_type,
  source_url = excluded.source_url,
  official_domain = excluded.official_domain,
  format = excluded.format,
  parser_key = excluded.parser_key,
  monitoring_mode = excluded.monitoring_mode,
  terms_note = excluded.terms_note,
  notes = excluded.notes,
  updated_at = now();

comment on column public.jobs.external_id is 'Stabilní ID poskytnuté smluvním poskytovatelem feedu.';
comment on column public.jobs.source_hash is 'SHA-256 veřejných normalizovaných polí pro idempotentní synchronizaci.';
