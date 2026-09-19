-- Bezpečná, pouze kontrolní vrstva nad akademickým kalendářem Brna.
-- Běh nikdy přímo nemění academic_events; opravy schvaluje správce ručně.
create table if not exists public.academic_calendar_ai_runs (
  id uuid primary key default gen_random_uuid(),
  city_id text not null references public.cities(id) on update cascade on delete restrict,
  trigger_type text not null check (trigger_type in ('scheduled','manual')),
  status text not null check (status in ('running','blocked','completed','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source_count integer not null default 0 check (source_count >= 0),
  checked_source_count integer not null default 0 check (checked_source_count >= 0),
  checked_event_count integer not null default 0 check (checked_event_count >= 0),
  finding_count integer not null default 0 check (finding_count >= 0),
  unavailable_source_count integer not null default 0 check (unavailable_source_count >= 0),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  error_message text,
  ai_provider text,
  ai_model text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.academic_calendar_ai_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.academic_calendar_ai_runs(id) on delete cascade,
  city_id text not null references public.cities(id) on update cascade on delete restrict,
  source_id text references public.content_sources(id) on update cascade on delete set null,
  academic_event_id uuid references public.academic_events(id) on delete set null,
  university_id text,
  faculty_id text,
  academic_year text,
  term_type text,
  current_value jsonb not null default '{}'::jsonb,
  discovered_value jsonb not null default '{}'::jsonb,
  difference text not null,
  source_url text not null check (source_url ~ '^https://'),
  source_published_at timestamptz,
  checked_at timestamptz not null default now(),
  confidence numeric(4,3) check (confidence >= 0 and confidence <= 1),
  recommended_action text,
  ai_reason text,
  status text not null default 'new' check (status in ('new','needs_review','confirmed_correct','approved_fix','rejected','resolved','cannot_verify')),
  resolution_note text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fingerprint)
);

create table if not exists public.academic_calendar_ai_finding_audit (
  id bigint generated always as identity primary key,
  finding_id uuid not null references public.academic_calendar_ai_findings(id) on delete cascade,
  old_status text not null,
  new_status text not null,
  note text,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.audit_academic_calendar_ai_finding() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status or old.resolution_note is distinct from new.resolution_note then
    insert into public.academic_calendar_ai_finding_audit(finding_id, old_status, new_status, note, actor_id)
    values (new.id, old.status, new.status, new.resolution_note, new.resolved_by);
  end if;
  return new;
end;
$$;

drop trigger if exists academic_calendar_ai_finding_audited on public.academic_calendar_ai_findings;
create trigger academic_calendar_ai_finding_audited
after update on public.academic_calendar_ai_findings
for each row execute function public.audit_academic_calendar_ai_finding();

create unique index if not exists academic_calendar_ai_one_running_city_idx
  on public.academic_calendar_ai_runs(city_id) where status = 'running';
create index if not exists academic_calendar_ai_runs_city_started_idx
  on public.academic_calendar_ai_runs(city_id, started_at desc);
create index if not exists academic_calendar_ai_findings_queue_idx
  on public.academic_calendar_ai_findings(city_id, status, checked_at desc);
create index if not exists academic_calendar_ai_findings_source_idx
  on public.academic_calendar_ai_findings(source_id, checked_at desc);
create index if not exists academic_calendar_ai_finding_audit_finding_idx
  on public.academic_calendar_ai_finding_audit(finding_id, created_at desc);

drop trigger if exists academic_calendar_ai_findings_updated on public.academic_calendar_ai_findings;
create trigger academic_calendar_ai_findings_updated
before update on public.academic_calendar_ai_findings
for each row execute function public.set_updated_at();

alter table public.academic_calendar_ai_runs enable row level security;
alter table public.academic_calendar_ai_findings enable row level security;
alter table public.academic_calendar_ai_finding_audit enable row level security;

drop policy if exists "calendar ai staff read brno" on public.academic_calendar_ai_runs;
create policy "calendar ai staff read brno" on public.academic_calendar_ai_runs
for select to authenticated using (
  city_id = 'brno' and public.can_manage_sensitive_city(city_id)
);
drop policy if exists "calendar ai staff read findings" on public.academic_calendar_ai_findings;
create policy "calendar ai staff read findings" on public.academic_calendar_ai_findings
for select to authenticated using (
  city_id = 'brno' and public.can_manage_sensitive_city(city_id)
);
drop policy if exists "calendar ai staff update findings" on public.academic_calendar_ai_findings;
-- Rozhodnutí o nálezu probíhá výhradně po serverové kontrole přes service_role.
-- Autentizovaný klient nemá UPDATE oprávnění ani RLS policy.

drop policy if exists "calendar ai staff read audit" on public.academic_calendar_ai_finding_audit;
create policy "calendar ai staff read audit" on public.academic_calendar_ai_finding_audit
for select to authenticated using (
  exists (
    select 1 from public.academic_calendar_ai_findings f
    where f.id = finding_id and (
      f.city_id = 'brno' and public.can_manage_sensitive_city(f.city_id)
    )
  )
);

revoke all on public.academic_calendar_ai_runs, public.academic_calendar_ai_findings, public.academic_calendar_ai_finding_audit from anon;
revoke all on public.academic_calendar_ai_runs, public.academic_calendar_ai_findings, public.academic_calendar_ai_finding_audit from authenticated;
grant select on public.academic_calendar_ai_runs, public.academic_calendar_ai_findings, public.academic_calendar_ai_finding_audit to authenticated;
grant all on public.academic_calendar_ai_runs, public.academic_calendar_ai_findings, public.academic_calendar_ai_finding_audit to service_role;

comment on table public.academic_calendar_ai_runs is 'Neveřejné běhy AI kontroly akademických zdrojů; nikdy nepublikují změny samy.';
comment on table public.academic_calendar_ai_findings is 'Neveřejné nálezy vyžadující ruční rozhodnutí správce.';
