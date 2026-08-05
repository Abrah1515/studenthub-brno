-- StudentHub Brno: odstranění aktivního kampusového scope, komunitní pomoc,
-- parťáci, bezpečný superadmin bootstrap a privacy-first analytika.

create table if not exists public.deprecated_campus_assignments (
  id bigint generated always as identity primary key,
  entity_table text not null,
  entity_id text not null,
  campus_id text,
  campus_name text,
  archived_payload jsonb not null default '{}'::jsonb,
  archived_at timestamptz not null default now(),
  unique (entity_table, entity_id)
);

insert into public.deprecated_campus_assignments (entity_table,entity_id,campus_id,archived_payload)
select 'academic_events',id::text,campus_id,jsonb_build_object('scope_type',scope_type)
from public.academic_events where campus_id is not null on conflict do nothing;
insert into public.deprecated_campus_assignments (entity_table,entity_id,campus_id,campus_name)
select 'places',id::text,campus_id,campus_name from public.places
where campus_id is not null or campus_name is not null on conflict do nothing;
insert into public.deprecated_campus_assignments (entity_table,entity_id,campus_id,campus_name)
select 'offers',id::text,campus_id,campus_name from public.offers
where campus_id is not null or campus_name is not null on conflict do nothing;
insert into public.deprecated_campus_assignments (entity_table,entity_id,campus_id)
select 'content_sources',id,campus_id from public.content_sources where campus_id is not null on conflict do nothing;

update public.academic_events set scope_type = case when faculty_id is not null then 'faculty' when university_id is not null then 'university' else 'city' end, campus_id = null where scope_type = 'campus' or campus_id is not null;
update public.places set campus_id = null;
update public.offers set campus_id = null;
update public.content_sources set campus_id = null;
update public.campuses set enabled = false where enabled;
comment on table public.campuses is 'DEPRECATED 2026-08-04: pouze historická data; aplikace kampus nepoužívá.';
comment on column public.places.campus_name is 'DEPRECATED: historická hodnota, nepoužívat pro filtr ani profil.';
comment on column public.offers.campus_name is 'DEPRECATED: historická hodnota, nepoužívat pro filtr ani profil.';

alter table public.academic_events drop constraint if exists academic_events_scope_type_check;
alter table public.academic_events drop constraint if exists academic_event_scope_valid;
alter table public.academic_events add constraint academic_events_scope_type_check check (scope_type in ('city','university','faculty','programme','national'));
alter table public.academic_events add constraint academic_event_scope_valid check (
  (scope_type = 'city' and city_id is not null and university_id is null and faculty_id is null and programme_id is null) or
  (scope_type = 'national' and university_id is null and faculty_id is null and programme_id is null) or
  (scope_type = 'university' and university_id is not null and faculty_id is null and programme_id is null) or
  (scope_type = 'faculty' and university_id is not null and faculty_id is not null and programme_id is null) or
  (scope_type = 'programme' and university_id is not null and faculty_id is not null and programme_id is not null)
);
drop trigger if exists academic_event_relations_valid on public.academic_events;
create or replace function public.validate_academic_event_relations() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.faculty_id is not null and not exists (select 1 from public.faculties f where f.id = new.faculty_id and f.university_id = new.university_id and f.is_active) then
    raise exception 'faculty_id does not belong to university_id';
  end if;
  return new;
end;
$$;
create trigger academic_event_relations_valid before insert or update of university_id,faculty_id,city_id on public.academic_events for each row execute function public.validate_academic_event_relations();
drop index if exists academic_events_scope_audience_idx;
create index academic_events_scope_audience_idx on public.academic_events(city_id,university_id,faculty_id,programme_id,starts_at) where status = 'approved';
alter table public.academic_events add column if not exists source_page integer check (source_page is null or source_page between 1 and 5000);
alter table public.source_review_queue add column if not exists source_page integer check (source_page is null or source_page between 1 and 5000);

alter table public.service_requests add column if not exists public_title text check (public_title is null or char_length(public_title) between 4 and 120);
alter table public.service_requests add column if not exists location text check (location is null or char_length(location) between 2 and 100);
alter table public.service_requests add column if not exists owner_token_hash text check (owner_token_hash is null or owner_token_hash ~ '^[a-f0-9]{64}$');
alter table public.service_requests add column if not exists moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected','hidden'));
alter table public.service_requests add column if not exists published_at timestamptz;
create index if not exists service_requests_public_idx on public.service_requests(city_id,moderation_status,service_type,created_at desc) where moderation_status = 'approved';
create index if not exists service_requests_owner_idx on public.service_requests(owner_token_hash,created_at desc) where owner_token_hash is not null;

create table public.buddy_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  city_id text not null references public.cities(id) on update cascade on delete restrict,
  activity_type text not null check (activity_type in ('beer','cinema','sport','culture','study','trip')),
  approximate_location text not null check (char_length(approximate_location) between 2 and 100),
  starts_at timestamptz not null,
  description text not null check (char_length(description) between 20 and 1200),
  max_participants integer not null check (max_participants between 2 and 30),
  status text not null default 'active' check (status in ('active','closed','expired')),
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected','hidden')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at >= starts_at)
);
create index buddy_posts_public_idx on public.buddy_posts(city_id,activity_type,starts_at) where moderation_status = 'approved' and status = 'active';
create index buddy_posts_owner_idx on public.buddy_posts(owner_id,created_at desc);

create table public.buddy_join_requests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.buddy_posts(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  message text not null default '' check (char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id,requester_id)
);

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('service_request','buddy_post')),
  target_id uuid not null,
  reporter_id uuid references public.profiles(id) on delete set null,
  reporter_session_hash text check (reporter_session_hash is null or reporter_session_hash ~ '^[a-f0-9]{64}$'),
  reason text not null check (reason in ('spam','harassment','illegal','privacy','outdated','other')),
  detail text not null default '' check (char_length(detail) <= 800),
  status text not null default 'new' check (status in ('new','reviewed','dismissed','actioned')),
  city_id text not null references public.cities(id) on update cascade on delete restrict,
  created_at timestamptz not null default now()
);
create index content_reports_queue_idx on public.content_reports(city_id,status,created_at desc);

create or replace function public.is_verified_user() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null);
$$;

alter table public.buddy_posts enable row level security;
alter table public.buddy_join_requests enable row level security;
alter table public.content_reports enable row level security;
alter table public.deprecated_campus_assignments enable row level security;

create policy "public reads approved active buddy posts" on public.buddy_posts for select to anon,authenticated using (moderation_status = 'approved' and status = 'active' and starts_at >= now() and expires_at >= now());
create policy "verified users read own buddy posts" on public.buddy_posts for select to authenticated using (owner_id = auth.uid());
create policy "verified users create buddy posts" on public.buddy_posts for insert to authenticated with check (owner_id = auth.uid() and public.is_verified_user() and moderation_status = 'pending');
create policy "verified users update own buddy posts" on public.buddy_posts for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid() and moderation_status in ('pending','approved'));
create policy "city staff moderate buddy posts" on public.buddy_posts for all to authenticated using (public.can_manage_city(city_id)) with check (public.can_manage_city(city_id));

create policy "participants read related join requests" on public.buddy_join_requests for select to authenticated using (requester_id = auth.uid() or exists (select 1 from public.buddy_posts p where p.id = post_id and p.owner_id = auth.uid()));
create policy "verified users request to join" on public.buddy_join_requests for insert to authenticated with check (requester_id = auth.uid() and public.is_verified_user() and exists (select 1 from public.buddy_posts p where p.id = post_id and p.owner_id <> auth.uid() and p.moderation_status = 'approved' and p.status = 'active' and p.expires_at >= now()));
create policy "requesters cancel own join requests" on public.buddy_join_requests for update to authenticated using (requester_id = auth.uid()) with check (requester_id = auth.uid() and status = 'cancelled');
create policy "post owners decide join requests" on public.buddy_join_requests for update to authenticated using (exists (select 1 from public.buddy_posts p where p.id = post_id and p.owner_id = auth.uid())) with check (status in ('accepted','rejected'));
create policy "verified users report content" on public.content_reports for insert to authenticated with check (reporter_id = auth.uid() and public.is_verified_user());
create policy "city staff manage reports" on public.content_reports for all to authenticated using (public.can_manage_city(city_id)) with check (public.can_manage_city(city_id));
create policy "super admins read campus archive" on public.deprecated_campus_assignments for select to authenticated using (public.is_super_admin());

drop policy if exists "profiles own read" on public.profiles;
create policy "profiles own or superadmin read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_super_admin());
create policy "superadmin manages profiles" on public.profiles for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

alter table public.page_views add column if not exists session_hash text check (session_hash is null or session_hash ~ '^[a-f0-9]{64}$');
alter table public.page_views add column if not exists device_type text check (device_type is null or device_type in ('mobile','tablet','desktop','other'));
alter table public.page_views add column if not exists referrer_domain text check (referrer_domain is null or (char_length(referrer_domain) <= 253 and referrer_domain !~ '[/?:#]'));
alter table public.page_views add column if not exists is_bot boolean not null default false;
create index if not exists page_views_day_session_idx on public.page_views(day_bucket,session_hash) where is_bot = false;
create index if not exists page_views_path_day_idx on public.page_views(path,day_bucket) where is_bot = false;
create index if not exists page_views_referrer_domain_idx on public.page_views(referrer_domain,day_bucket) where is_bot = false and referrer_domain is not null;

-- Analytiku smĂ­ zapisovat jen server po ovÄ›Ĺ™enĂ­ opt-in cookie. PĹŻvodnĂ­
-- pĹ™Ă­mĂ˝ grant pro klienta obchĂˇzel serverovou kontrolu souhlasu a rate limit.
drop policy if exists "anonymous records consented page views" on public.page_views;
revoke insert on public.page_views from anon,authenticated;
grant select,insert on public.page_views to service_role;

grant select on public.buddy_posts to anon,authenticated;
revoke insert,update,delete on public.buddy_posts,public.buddy_join_requests from authenticated;
revoke insert,update,delete on public.content_reports from authenticated;
grant select,insert,update,delete on public.buddy_posts,public.buddy_join_requests,public.content_reports to service_role;
grant select on public.deprecated_campus_assignments to authenticated;
grant select,update on public.profiles to authenticated;
grant all on public.deprecated_campus_assignments to service_role;

drop trigger if exists buddy_posts_updated on public.buddy_posts;
drop trigger if exists buddy_join_requests_updated on public.buddy_join_requests;
create trigger buddy_posts_updated before update on public.buddy_posts for each row execute function public.set_updated_at();
create trigger buddy_join_requests_updated before update on public.buddy_join_requests for each row execute function public.set_updated_at();

create or replace function public.protect_buddy_moderation() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.moderation_status is distinct from old.moderation_status and current_user <> 'service_role' and not public.can_manage_city(old.city_id) then
    raise exception 'moderation_status can be changed only by authorized staff';
  end if;
  return new;
end;
$$;
drop trigger if exists buddy_posts_protect_moderation on public.buddy_posts;
create trigger buddy_posts_protect_moderation before update of moderation_status on public.buddy_posts for each row execute function public.protect_buddy_moderation();

create or replace function public.enforce_buddy_capacity() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  capacity integer;
  accepted_count integer;
begin
  if new.status <> 'accepted' then return new; end if;
  select max_participants into capacity from public.buddy_posts where id = new.post_id for update;
  select count(*)::integer into accepted_count from public.buddy_join_requests where post_id = new.post_id and status = 'accepted' and id <> new.id;
  if capacity is null or accepted_count >= capacity - 1 then raise exception 'buddy post capacity has been reached'; end if;
  return new;
end;
$$;
drop trigger if exists buddy_join_capacity on public.buddy_join_requests;
create trigger buddy_join_capacity before insert or update on public.buddy_join_requests for each row execute function public.enforce_buddy_capacity();

revoke all on public.campuses from anon;
