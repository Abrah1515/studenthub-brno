-- StudentHub Brno: provozní plánování zdrojů, konflikty, bezpečná komunita a kontaktní inbox.

alter table public.content_sources
  add column if not exists next_check_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_error_at timestamptz,
  add column if not exists last_error_message text,
  add column if not exists source_modified_at timestamptz,
  add column if not exists source_modified_basis text
    check (source_modified_basis is null or source_modified_basis in ('explicit_school_update','document_revision','http_last_modified','first_detected')),
  add column if not exists failure_alerted_at timestamptz;

update public.content_sources
set refresh_interval = least(refresh_interval, interval '9 hours'),
    next_check_at = coalesce(next_check_at, last_checked_at + least(refresh_interval, interval '9 hours'), now())
where enabled;

alter table public.content_sources drop constraint if exists content_sources_refresh_interval_check;
alter table public.content_sources add constraint content_sources_refresh_interval_check
  check (refresh_interval between interval '1 hour' and interval '10 hours');

create index if not exists content_sources_next_check_idx
  on public.content_sources(next_check_at, university_id, faculty_id)
  where enabled = true;

-- Jediný atomický nárok zabrání souběžným cronům i dvojímu ručnímu spuštění.
create or replace function public.claim_due_content_sources(batch_size integer default 3)
returns table(source_id text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select s.id
    from public.content_sources s
    where s.enabled
      and coalesce(s.next_retry_at, s.next_check_at, now()) <= now()
      and (s.sync_status <> 'running' or s.last_checked_at < now() - interval '30 minutes')
    order by coalesce(s.next_retry_at, s.next_check_at, now()), s.id
    for update skip locked
    limit greatest(1, least(batch_size, 10))
  ), claimed as (
    update public.content_sources s
    set sync_status = 'running', last_checked_at = now(), next_retry_at = null
    from due where s.id = due.id
    returning s.id
  )
  select claimed.id from claimed;
end;
$$;
revoke all on function public.claim_due_content_sources(integer) from public,anon,authenticated;
grant execute on function public.claim_due_content_sources(integer) to service_role;

create or replace function public.claim_content_source(source_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare claimed integer;
begin
  update public.content_sources
  set sync_status = 'running', last_checked_at = now(), next_retry_at = null
  where id = source_key and enabled = true
    and (sync_status <> 'running' or last_checked_at < now() - interval '30 minutes');
  get diagnostics claimed = row_count;
  return claimed = 1;
end;
$$;
revoke all on function public.claim_content_source(text) from public,anon,authenticated;
grant execute on function public.claim_content_source(text) to service_role;

alter table public.academic_events
  add column if not exists semester text check (semester is null or semester in ('autumn','spring','year_round')),
  add column if not exists source_modified_at timestamptz,
  add column if not exists source_modified_basis text
    check (source_modified_basis is null or source_modified_basis in ('explicit_school_update','document_revision','http_last_modified','first_detected'));

-- Deduplikace musí rozlišovat akademický rok; starý a nový dokument smějí existovat souběžně.
drop index if exists academic_events_dedupe_idx;
create unique index academic_events_dedupe_idx
  on public.academic_events(duplicate_fingerprint, academic_year)
  where duplicate_fingerprint is not null and status <> 'archived';
create index if not exists academic_events_year_scope_idx
  on public.academic_events(academic_year,university_id,faculty_id,starts_at)
  where status = 'approved';

create table if not exists public.academic_event_conflicts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.academic_events(id) on delete set null,
  source_id text not null references public.content_sources(id) on update cascade on delete cascade,
  competing_source_id text references public.content_sources(id) on update cascade on delete set null,
  academic_year text not null check (academic_year ~ '^20[0-9]{2}/20[0-9]{2}$'),
  fingerprint text not null,
  existing_payload jsonb not null default '{}'::jsonb,
  proposed_payload jsonb not null default '{}'::jsonb,
  existing_modified_at timestamptz,
  proposed_modified_at timestamptz,
  decision_basis text,
  reason text not null,
  status text not null default 'open' check (status in ('open','accepted_existing','accepted_proposed','dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, academic_year, fingerprint, status)
);
create index if not exists academic_event_conflicts_queue_idx
  on public.academic_event_conflicts(status,created_at desc) where status = 'open';
alter table public.academic_event_conflicts enable row level security;
create policy "staff read source conflicts" on public.academic_event_conflicts for select to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.content_sources s
    where s.id = source_id and (s.faculty_id = public.editor_faculty_id() or exists (
      select 1 from public.university_cities uc where uc.university_id = s.university_id and public.can_manage_city(uc.city_id)
    ))
  ));
create policy "superadmin resolves source conflicts" on public.academic_event_conflicts for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
grant select,update on public.academic_event_conflicts to authenticated;
grant all on public.academic_event_conflicts to service_role;

alter table public.places
  add column if not exists why_visit text,
  add column if not exists price_level text check (price_level is null or price_level in ('free','low','medium','high','varies')),
  add column if not exists student_discount text,
  add column if not exists opening_hours_verified_at timestamptz;

alter table public.offers
  add column if not exists geographic_scope text not null default 'brno'
    check (geographic_scope in ('brno','national','online'));

alter table public.profiles add column if not exists is_blocked boolean not null default false;

alter table public.buddy_posts alter column moderation_status set default 'approved';
update public.buddy_posts set moderation_status = 'approved'
where moderation_status = 'pending' and status = 'active' and expires_at >= now();
drop policy if exists "verified users create buddy posts" on public.buddy_posts;
create policy "verified unblocked users create buddy posts" on public.buddy_posts for insert to authenticated
  with check (
    owner_id = auth.uid() and public.is_verified_user() and moderation_status = 'approved'
    and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_blocked)
  );
drop policy if exists "verified users update own buddy posts" on public.buddy_posts;
create policy "verified users update own buddy posts" on public.buddy_posts for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and moderation_status in ('approved','hidden'));

alter table public.content_reports
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists resolution text;
create unique index if not exists content_reports_session_target_unique
  on public.content_reports(reporter_session_hash,target_type,target_id)
  where reporter_session_hash is not null;
create unique index if not exists content_reports_user_target_unique
  on public.content_reports(reporter_id,target_type,target_id)
  where reporter_id is not null;

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  email text not null check (char_length(email) between 5 and 254),
  subject text not null check (char_length(subject) between 3 and 160),
  message text not null check (char_length(message) between 20 and 4000),
  status text not null default 'new' check (status in ('new','sent','delivery_failed','resolved')),
  delivery_provider_id text,
  city_id text references public.cities(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contact_messages_queue_idx on public.contact_messages(status,created_at desc);
alter table public.contact_messages enable row level security;
create policy "city staff read contact messages" on public.contact_messages for select to authenticated
  using (public.is_super_admin() or (city_id is not null and public.can_manage_city(city_id)));
create policy "city staff update contact messages" on public.contact_messages for update to authenticated
  using (public.is_super_admin() or (city_id is not null and public.can_manage_city(city_id)))
  with check (public.is_super_admin() or (city_id is not null and public.can_manage_city(city_id)));
grant select,update on public.contact_messages to authenticated;
grant all on public.contact_messages to service_role;
drop trigger if exists contact_messages_updated on public.contact_messages;
create trigger contact_messages_updated before update on public.contact_messages
  for each row execute function public.set_updated_at();
