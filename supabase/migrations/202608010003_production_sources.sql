-- Produkční registr veřejných zdrojů, historie synchronizací a ověřování odkazů.
-- Migrace pouze rozšiřuje schéma; dřívější záznamy nemaže. Falešná seed data archivuje.

alter type public.event_category add value if not exists 'semester_start';
alter type public.event_category add value if not exists 'semester_end';
alter type public.event_category add value if not exists 'course_registration';
alter type public.event_category add value if not exists 'course_enrollment';
alter type public.event_category add value if not exists 'enrollment_changes';
alter type public.event_category add value if not exists 'timetable_release';
alter type public.event_category add value if not exists 'final_exam';
alter type public.event_category add value if not exists 'thesis_deadline';
alter type public.event_category add value if not exists 'matriculation';
alter type public.event_category add value if not exists 'graduation';
alter type public.event_category add value if not exists 'faculty_event';

create table public.content_sources (
  id text primary key check (id ~ '^src-[a-z0-9-]+$'),
  university_id text not null references public.universities(id) on update cascade on delete restrict,
  faculty_id text not null references public.faculties(id) on update cascade on delete restrict,
  source_type text not null check (source_type in ('academic_calendar', 'place_directory', 'offer_feed', 'job_feed')),
  source_url text not null check (source_url ~ '^https://'),
  official_domain text not null check (official_domain ~ '^[a-z0-9.-]+$'),
  format text not null check (format in ('api', 'json', 'ics', 'xml', 'html', 'pdf')),
  parser_key text not null,
  enabled boolean not null default false,
  refresh_interval interval not null default interval '1 day' check (refresh_interval >= interval '1 hour'),
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  last_success_at timestamptz,
  last_http_status integer check (last_http_status between 100 and 599),
  etag text,
  last_modified text,
  content_hash text check (content_hash is null or content_hash ~ '^[a-f0-9]{64}$'),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  sync_status text not null default 'idle' check (sync_status in ('idle', 'running', 'success', 'not_modified', 'failed', 'stale', 'manual_review', 'not_found')),
  terms_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (faculty_id, source_type, source_url)
);

create table public.source_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.content_sources(id) on update cascade on delete cascade,
  status text not null check (status in ('running', 'success', 'review', 'not_modified', 'failed', 'cancelled')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  http_status integer check (http_status between 100 and 599),
  content_hash text,
  discovered_count integer not null default 0,
  published_count integer not null default 0,
  review_count integer not null default 0,
  error_message text,
  triggered_by uuid references public.profiles(id),
  trigger_type text not null default 'cron' check (trigger_type in ('cron', 'manual', 'retry')),
  created_at timestamptz not null default now()
);

create table public.source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.content_sources(id) on update cascade on delete cascade,
  sync_run_id uuid references public.source_sync_runs(id) on delete set null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  content_type text not null,
  content bytea not null check (octet_length(content) <= 5242880),
  created_at timestamptz not null default now(),
  unique (source_id, content_hash)
);

create table public.academic_event_versions (
  id bigint generated always as identity primary key,
  academic_event_id uuid not null references public.academic_events(id) on delete cascade,
  source_sync_run_id uuid references public.source_sync_runs(id) on delete set null,
  version_data jsonb not null,
  changed_fields text[] not null default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.source_review_queue (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.content_sources(id) on update cascade on delete cascade,
  sync_run_id uuid references public.source_sync_runs(id) on delete set null,
  proposed_payload jsonb not null check (jsonb_typeof(proposed_payload) = 'object'),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.link_checks (
  id bigint generated always as identity primary key,
  url text not null check (url ~ '^https://'),
  source_id text references public.content_sources(id) on update cascade on delete cascade,
  entity_type text check (entity_type in ('source', 'event', 'place', 'offer', 'job')),
  entity_id text,
  checked_at timestamptz not null default now(),
  http_status integer check (http_status between 100 and 599),
  response_ms integer check (response_ms is null or response_ms >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  status text not null check (status in ('ok', 'redirect', 'temporary_failure', 'broken', 'skipped')),
  error_message text
);

alter table public.academic_events add column if not exists external_id text;
alter table public.academic_events add column if not exists source_id text references public.content_sources(id) on update cascade on delete set null;
alter table public.academic_events add column if not exists all_day boolean not null default false;
alter table public.academic_events add column if not exists timezone text not null default 'Europe/Prague' check (timezone = 'Europe/Prague');
alter table public.academic_events add column if not exists academic_year text check (academic_year is null or academic_year ~ '^[0-9]{4}/[0-9]{4}$');
alter table public.academic_events add column if not exists source_hash text;
alter table public.academic_events add column if not exists confidence numeric(4,3) check (confidence between 0 and 1);
alter table public.academic_events add column if not exists last_verified_at timestamptz;
alter table public.academic_events add column if not exists verification_status text not null default 'needs_review' check (verification_status in ('verified', 'needs_review', 'stale'));
alter table public.academic_events add column if not exists change_state text not null default 'unchanged' check (change_state in ('unchanged', 'changed', 'cancelled'));
alter table public.academic_events add column if not exists is_cancelled boolean not null default false;
alter table public.academic_events add column if not exists archived_at timestamptz;
alter table public.academic_events add column if not exists manual_override boolean not null default false;
alter table public.academic_events add column if not exists duplicate_fingerprint text;
alter table public.academic_events add constraint academic_events_source_external_unique unique (source_id, external_id);

alter table public.places add column if not exists source_url text;
alter table public.places add column if not exists last_verified_at timestamptz;
alter table public.places add column if not exists verification_status text not null default 'needs_review' check (verification_status in ('verified', 'needs_review', 'unavailable'));
alter table public.places add column if not exists osm_type text check (osm_type in ('node', 'way', 'relation'));
alter table public.places add column if not exists osm_id bigint;

alter table public.offers add column if not exists source_url text;
alter table public.offers add column if not exists last_verified_at timestamptz;
alter table public.offers add column if not exists requires_isic boolean not null default false;
alter table public.offers add column if not exists verification_status text not null default 'needs_review' check (verification_status in ('verified', 'needs_review', 'unavailable'));

alter table public.jobs add column if not exists source_url text;
alter table public.jobs add column if not exists last_verified_at timestamptz;
alter table public.jobs add column if not exists expires_at timestamptz;
alter table public.jobs add column if not exists verification_status text not null default 'needs_review' check (verification_status in ('verified', 'needs_review', 'unavailable'));
alter table public.jobs add column if not exists provider_key text;

create index content_sources_due_idx on public.content_sources (enabled, last_checked_at, university_id);
create index content_sources_health_idx on public.content_sources (sync_status, consecutive_failures desc);
create index source_sync_runs_source_started_idx on public.source_sync_runs (source_id, started_at desc);
create index source_review_queue_pending_idx on public.source_review_queue (status, created_at desc) where status = 'pending';
create index academic_events_source_external_idx on public.academic_events (source_id, external_id);
create unique index academic_events_dedupe_idx on public.academic_events (duplicate_fingerprint) where duplicate_fingerprint is not null and status <> 'archived';
create index academic_events_verified_date_idx on public.academic_events (university_id, faculty_id, starts_at) where status = 'approved' and is_demo = false and is_cancelled = false;
create index link_checks_url_checked_idx on public.link_checks (url, checked_at desc);

create trigger content_sources_updated before update on public.content_sources for each row execute function public.set_updated_at();
create trigger source_review_queue_updated before update on public.source_review_queue for each row execute function public.set_updated_at();

create or replace function public.capture_academic_event_version() returns trigger language plpgsql security definer set search_path = '' as $$
declare changed text[];
begin
  if old is distinct from new then
    select coalesce(array_agg(n.key order by n.key), '{}'::text[]) into changed
    from jsonb_each(to_jsonb(new)) n
    left join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value;
    insert into public.academic_event_versions (academic_event_id, version_data, changed_fields, created_by)
    values (old.id, to_jsonb(old), changed, auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists academic_event_versioned on public.academic_events;
create trigger academic_event_versioned before update on public.academic_events for each row execute function public.capture_academic_event_version();

create or replace function public.claim_content_source(source_key text) returns boolean language plpgsql security definer set search_path = '' as $$
declare claimed integer;
begin
  update public.content_sources
  set sync_status = 'running', last_checked_at = now()
  where id = source_key and enabled = true and (sync_status <> 'running' or last_checked_at < now() - interval '30 minutes');
  get diagnostics claimed = row_count;
  return claimed = 1;
end;
$$;
revoke all on function public.claim_content_source(text) from public, anon, authenticated;
grant execute on function public.claim_content_source(text) to service_role;

-- Historické demonstrační záznamy zůstanou dohledatelné správcům, ale nikdy veřejné.
update public.academic_events set status = 'archived', archived_at = now() where is_demo = true and status <> 'archived';
update public.places set status = 'archived' where is_demo = true and status <> 'archived';
update public.offers set status = 'archived' where is_demo = true and status <> 'archived';
update public.jobs set status = 'archived' where is_demo = true and status <> 'archived';

drop policy if exists "public reads approved events" on public.academic_events;
drop policy if exists "public reads approved places" on public.places;
drop policy if exists "public reads approved offers" on public.offers;
drop policy if exists "public reads approved jobs" on public.jobs;
create policy "public reads verified events" on public.academic_events for select to anon, authenticated using (status = 'approved' and is_demo = false and verification_status = 'verified' and is_cancelled = false);
create policy "public reads verified places" on public.places for select to anon, authenticated using (status = 'approved' and is_demo = false and verification_status = 'verified');
create policy "public reads verified offers" on public.offers for select to anon, authenticated using (status = 'approved' and is_demo = false and verification_status = 'verified' and (valid_to is null or valid_to >= current_date));
create policy "public reads verified jobs" on public.jobs for select to anon, authenticated using (status = 'approved' and is_demo = false and verification_status = 'verified' and (expires_at is null or expires_at >= now()));

alter table public.content_sources enable row level security;
alter table public.source_sync_runs enable row level security;
alter table public.source_snapshots enable row level security;
alter table public.academic_event_versions enable row level security;
alter table public.source_review_queue enable row level security;
alter table public.link_checks enable row level security;

create policy "admins manage content sources" on public.content_sources for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "faculty editors read scoped sources" on public.content_sources for select to authenticated using (faculty_id = public.editor_faculty_id());
create policy "admins read sync runs" on public.source_sync_runs for select to authenticated using (public.is_admin());
create policy "faculty editors read scoped sync runs" on public.source_sync_runs for select to authenticated using (exists (select 1 from public.content_sources s where s.id = source_id and s.faculty_id = public.editor_faculty_id()));
create policy "admins read snapshots" on public.source_snapshots for select to authenticated using (public.is_admin());
create policy "admins read event versions" on public.academic_event_versions for select to authenticated using (public.is_admin());
create policy "faculty editors read scoped versions" on public.academic_event_versions for select to authenticated using (exists (select 1 from public.academic_events e where e.id = academic_event_id and e.faculty_id = public.editor_faculty_id()));
create policy "admins manage review queue" on public.source_review_queue for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "faculty editors manage scoped review queue" on public.source_review_queue for all to authenticated using (exists (select 1 from public.content_sources s where s.id = source_id and s.faculty_id = public.editor_faculty_id())) with check (exists (select 1 from public.content_sources s where s.id = source_id and s.faculty_id = public.editor_faculty_id()));
create policy "admins read link checks" on public.link_checks for select to authenticated using (public.is_admin());

revoke all on public.content_sources, public.source_sync_runs, public.source_snapshots, public.academic_event_versions, public.source_review_queue, public.link_checks from anon;
grant select on public.content_sources, public.source_sync_runs, public.academic_event_versions, public.source_review_queue to authenticated;

-- Registr oficiálních zdrojů se doplní idempotentně ze souboru supabase/seed.sql.
