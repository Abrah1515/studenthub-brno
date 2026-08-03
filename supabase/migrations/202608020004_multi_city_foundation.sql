-- Příprava StudentHub Brno na více měst. Migrace je dopředná, zachovává ID i obsah
-- a do produkčních dat vkládá pouze aktivní Brno.

create table if not exists public.cities (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null unique,
  region text not null,
  country_code char(2) not null default 'CZ' check (country_code ~ '^[A-Z]{2}$'),
  timezone text not null default 'Europe/Prague',
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  map_bounds jsonb not null check (jsonb_typeof(map_bounds) = 'array' and jsonb_array_length(map_bounds) = 2),
  map_zoom smallint not null default 13 check (map_zoom between 1 and 18),
  enabled boolean not null default false,
  public_status text not null default 'draft' check (public_status in ('draft','review','published','archived')),
  sort_order integer not null default 100,
  brand_config jsonb not null default '{}'::jsonb check (jsonb_typeof(brand_config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.cities (id, slug, name, region, country_code, timezone, latitude, longitude, map_bounds, map_zoom, enabled, public_status, sort_order, brand_config)
values ('brno','brno','Brno','Jihomoravský kraj','CZ','Europe/Prague',49.195100,16.606800,'[[49.115,16.45],[49.31,16.75]]'::jsonb,13,true,'published',10,'{"editionName":"StudentHub Brno","editionShortName":"Brno"}'::jsonb)
on conflict (id) do update set slug = excluded.slug, name = excluded.name, region = excluded.region, country_code = excluded.country_code, timezone = excluded.timezone, latitude = excluded.latitude, longitude = excluded.longitude, map_bounds = excluded.map_bounds, map_zoom = excluded.map_zoom, updated_at = now();

create table if not exists public.university_cities (
  university_id text not null references public.universities(id) on update cascade on delete cascade,
  city_id text not null references public.cities(id) on update cascade on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (university_id, city_id)
);
insert into public.university_cities (university_id, city_id, is_primary)
select id, 'brno', true from public.universities
on conflict (university_id, city_id) do nothing;

create table if not exists public.campuses (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  city_id text not null references public.cities(id) on update cascade on delete restrict,
  university_id text references public.universities(id) on update cascade on delete restrict,
  faculty_id text references public.faculties(id) on update cascade on delete restrict,
  name text not null,
  address text,
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, university_id, name)
);
insert into public.campuses (id,city_id,university_id,name,address,latitude,longitude) values
('brno-muni-bohunice','brno','muni','Bohunice','Kamenice, Brno',49.177400,16.569200),
('brno-muni-veveri','brno','muni','Veveří','Veveří, Brno',49.209000,16.596000),
('brno-muni-vinarska','brno','muni','Vinařská','Vinařská, Brno',49.187900,16.584900),
('brno-vut-ppv','brno','vut','Pod Palackého vrchem','Technická, Brno',49.229200,16.574700),
('brno-vut-udolni','brno','vut','Údolní','Údolní, Brno',49.198800,16.598200),
('brno-mendelu-cerna-pole','brno','mendelu','Černá Pole','Zemědělská, Brno',49.211500,16.616600),
('brno-vetuni-kralovo-pole','brno','vetuni','Královo Pole','Palackého třída, Brno',49.217500,16.596500),
('brno-jamu-centrum','brno','jamu','Centrum','Centrum Brna',49.196800,16.608500)
on conflict (id) do nothing;

alter table public.profiles add column if not exists city_id text references public.cities(id) on update cascade on delete restrict;
update public.profiles set city_id = 'brno' where city_id is null and role <> 'user';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user','faculty_editor','city_editor','admin','super_admin'));

alter table public.academic_events add column if not exists city_id text references public.cities(id) on update cascade on delete restrict;
alter table public.academic_events drop constraint if exists academic_events_scope_type_check;
alter table public.academic_events drop constraint if exists academic_event_scope_valid;
update public.academic_events set city_id = 'brno', scope_type = 'city' where scope_type = 'brno';
alter table public.academic_events alter column scope_type set default 'city';
alter table public.academic_events add constraint academic_events_scope_type_check check (scope_type in ('city','university','faculty','national'));
alter table public.academic_events add constraint academic_event_scope_valid check (
  (scope_type = 'city' and city_id is not null and university_id is null and faculty_id is null) or
  (scope_type = 'university' and university_id is not null and faculty_id is null) or
  (scope_type = 'faculty' and university_id is not null and faculty_id is not null) or
  (scope_type = 'national' and city_id is null and university_id is null and faculty_id is null)
);

alter table public.places add column if not exists city_id text references public.cities(id) on update cascade on delete restrict;
update public.places set city_id = 'brno' where city_id is null;
alter table public.places alter column city_id set not null;
alter table public.places alter column city_id set default 'brno'; -- kompatibilita současného Brno seed skriptu; nové edice zapisují město explicitně
alter table public.places add column if not exists campus_id text references public.campuses(id) on update cascade on delete set null;
update public.places p set campus_id = c.id from public.campuses c where p.campus_id is null and p.city_id = c.city_id and p.university_id = c.university_id and lower(p.campus_name) = lower(c.name);

create table if not exists public.offer_cities (
  offer_id uuid not null references public.offers(id) on delete cascade,
  city_id text not null references public.cities(id) on update cascade on delete restrict,
  created_at timestamptz not null default now(),
  primary key (offer_id, city_id)
);
insert into public.offer_cities (offer_id, city_id) select id, 'brno' from public.offers on conflict do nothing;
alter table public.offers add column if not exists campus_id text references public.campuses(id) on update cascade on delete set null;

alter table public.jobs add column if not exists city_id text references public.cities(id) on update cascade on delete restrict;
alter table public.jobs add column if not exists work_location_mode text not null default 'onsite' check (work_location_mode in ('onsite','hybrid','remote'));
update public.jobs set city_id = 'brno' where city_id is null and work_location_mode <> 'remote';
alter table public.jobs drop constraint if exists jobs_city_or_remote;
alter table public.jobs add constraint jobs_city_or_remote check (work_location_mode = 'remote' or city_id is not null);

alter table public.service_requests add column if not exists city_id text references public.cities(id) on update cascade on delete restrict;
update public.service_requests set city_id = 'brno' where city_id is null;
alter table public.service_requests alter column city_id set not null;
alter table public.submissions add column if not exists city_id text references public.cities(id) on update cascade on delete restrict;
update public.submissions set city_id = 'brno' where city_id is null;
alter table public.community_referrals add column if not exists city_id text references public.cities(id) on update cascade on delete restrict;
update public.community_referrals set city_id = 'brno' where city_id is null;
alter table public.outbound_clicks add column if not exists city_id text references public.cities(id) on update cascade on delete restrict;
update public.outbound_clicks set city_id = 'brno' where city_id is null;
alter table public.page_views add column if not exists city_id text references public.cities(id) on update cascade on delete restrict;
update public.page_views set city_id = 'brno' where city_id is null;

alter table public.content_sources add column if not exists city_id text references public.cities(id) on update cascade on delete restrict;
alter table public.content_sources add column if not exists campus_id text references public.campuses(id) on update cascade on delete set null;
alter table public.content_sources drop constraint if exists content_sources_local_city_valid;
alter table public.content_sources add constraint content_sources_local_city_valid check (source_type = 'academic_calendar' or city_id is not null);
alter table public.source_sync_runs add column if not exists city_id text references public.cities(id) on update cascade on delete restrict;
update public.source_sync_runs r set city_id = s.city_id from public.content_sources s where r.source_id = s.id and r.city_id is null;
alter table public.link_checks add column if not exists city_id text references public.cities(id) on update cascade on delete restrict;

create table if not exists public.content_publication_events (
  id bigint generated always as identity primary key,
  content_type text not null check (content_type in ('academic_event','place','offer','job')),
  content_id text not null,
  city_id text references public.cities(id) on update cascade on delete restrict,
  university_id text references public.universities(id) on update cascade on delete set null,
  faculty_id text references public.faculties(id) on update cascade on delete set null,
  event_type text not null check (event_type in ('published','updated','expiring','archived')),
  occurred_at timestamptz not null default now(),
  verified boolean not null default false,
  source_url text,
  promotable boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.content_publication_events is 'Bezpečný outbox veřejného obsahu; nesmí obsahovat PII, kontakty ani formulářová data.';

create or replace function public.enqueue_publication_event() returns trigger language plpgsql security definer set search_path = '' as $$
declare kind text; city_key text; source_link text; verified_flag boolean; promotable_flag boolean;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status and old.updated_at is not distinct from new.updated_at then return new; end if;
  if new.status = 'archived' then kind := 'archived';
  elsif new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from new.status) then kind := 'published';
  elsif new.status = 'approved' then kind := 'updated'; else return new; end if;
  if tg_table_name = 'offers' then select oc.city_id into city_key from public.offer_cities oc where oc.offer_id = new.id order by oc.city_id limit 1;
  elsif tg_table_name = 'academic_events' or tg_table_name = 'places' or tg_table_name = 'jobs' then city_key := new.city_id; end if;
  source_link := case when to_jsonb(new) ? 'source_url' then to_jsonb(new)->>'source_url' else null end;
  verified_flag := coalesce(to_jsonb(new)->>'verification_status','') = 'verified' and coalesce((to_jsonb(new)->>'is_demo')::boolean,false) = false;
  promotable_flag := kind in ('published','updated') and verified_flag and source_link is not null;
  insert into public.content_publication_events (content_type,content_id,city_id,university_id,faculty_id,event_type,verified,source_url,promotable)
  values (case tg_table_name when 'academic_events' then 'academic_event' else left(tg_table_name,-1) end,new.id::text,city_key,nullif(to_jsonb(new)->>'university_id',''),nullif(to_jsonb(new)->>'faculty_id',''),kind,verified_flag,source_link,promotable_flag);
  return new;
end;
$$;
drop trigger if exists academic_events_publication_outbox on public.academic_events;
drop trigger if exists places_publication_outbox on public.places;
drop trigger if exists offers_publication_outbox on public.offers;
drop trigger if exists jobs_publication_outbox on public.jobs;
create trigger academic_events_publication_outbox after insert or update on public.academic_events for each row execute function public.enqueue_publication_event();
create trigger places_publication_outbox after insert or update on public.places for each row execute function public.enqueue_publication_event();
create trigger offers_publication_outbox after insert or update on public.offers for each row execute function public.enqueue_publication_event();
create trigger jobs_publication_outbox after insert or update on public.jobs for each row execute function public.enqueue_publication_event();

create index if not exists cities_public_idx on public.cities (public_status, enabled, sort_order);
create index if not exists university_cities_city_idx on public.university_cities (city_id, university_id);
create index if not exists campuses_city_university_idx on public.campuses (city_id, university_id, enabled);
create index if not exists academic_events_city_date_idx on public.academic_events (city_id, starts_at) where status = 'approved';
create index if not exists places_city_category_idx on public.places (city_id, category, name) where status = 'approved';
create index if not exists offer_cities_city_idx on public.offer_cities (city_id, offer_id);
create index if not exists jobs_city_mode_idx on public.jobs (city_id, work_location_mode, is_featured desc) where status = 'approved';
create index if not exists service_requests_city_status_idx on public.service_requests (city_id, status, created_at desc);
create index if not exists submissions_city_status_idx on public.submissions (city_id, status, created_at desc);
create index if not exists page_views_city_school_day_idx on public.page_views (city_id, university_id, faculty_id, day_bucket);
create index if not exists outbound_clicks_city_day_idx on public.outbound_clicks (city_id, day_bucket);
create index if not exists publication_events_city_pending_idx on public.content_publication_events (city_id, occurred_at) where processed_at is null and promotable = true;

drop trigger if exists cities_updated on public.cities;
drop trigger if exists campuses_updated on public.campuses;
create trigger cities_updated before update on public.cities for each row execute function public.set_updated_at();
create trigger campuses_updated before update on public.campuses for each row execute function public.set_updated_at();

create or replace function public.is_super_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin');
$$;
create or replace function public.editor_city_id() returns text language sql stable security definer set search_path = '' as $$
  select city_id from public.profiles where id = auth.uid() and role in ('city_editor','admin') limit 1;
$$;
create or replace function public.can_manage_city(target_city text) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or exists (select 1 from public.profiles where id = auth.uid() and role in ('city_editor','admin') and city_id = target_city);
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_super_admin();
$$;
create or replace function public.is_content_editor() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('faculty_editor','city_editor','admin','super_admin'));
$$;

alter table public.cities enable row level security;
alter table public.university_cities enable row level security;
alter table public.campuses enable row level security;
alter table public.offer_cities enable row level security;
alter table public.content_publication_events enable row level security;
drop policy if exists "public reads published cities" on public.cities;
drop policy if exists "super admins manage cities" on public.cities;
drop policy if exists "city staff read assigned city" on public.cities;
drop policy if exists "public reads university city links" on public.university_cities;
drop policy if exists "super admins manage university city links" on public.university_cities;
drop policy if exists "public reads active campuses" on public.campuses;
drop policy if exists "city staff manage campuses" on public.campuses;
drop policy if exists "public reads offer city links" on public.offer_cities;
drop policy if exists "city staff manage offer city links" on public.offer_cities;
create policy "public reads published cities" on public.cities for select to anon, authenticated using (enabled and public_status = 'published');
create policy "super admins manage cities" on public.cities for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "city staff read assigned city" on public.cities for select to authenticated using (public.can_manage_city(id));
create policy "public reads university city links" on public.university_cities for select to anon, authenticated using (exists (select 1 from public.cities c where c.id = city_id and c.enabled and c.public_status = 'published'));
create policy "super admins manage university city links" on public.university_cities for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "public reads active campuses" on public.campuses for select to anon, authenticated using (enabled and exists (select 1 from public.cities c where c.id = city_id and c.enabled and c.public_status = 'published'));
create policy "city staff manage campuses" on public.campuses for all to authenticated using (public.can_manage_city(city_id)) with check (public.can_manage_city(city_id));
create policy "public reads offer city links" on public.offer_cities for select to anon, authenticated using (exists (select 1 from public.cities c where c.id = city_id and c.enabled and c.public_status = 'published'));
create policy "city staff manage offer city links" on public.offer_cities for all to authenticated using (public.can_manage_city(city_id)) with check (public.can_manage_city(city_id));

drop policy if exists "public reads verified events" on public.academic_events;
drop policy if exists "public reads verified places" on public.places;
drop policy if exists "public reads verified offers" on public.offers;
drop policy if exists "public reads verified jobs" on public.jobs;
drop policy if exists "admins manage events" on public.academic_events;
drop policy if exists "admins manage places" on public.places;
drop policy if exists "admins manage offers" on public.offers;
drop policy if exists "admins manage jobs" on public.jobs;
drop policy if exists "admins read requests" on public.service_requests;
drop policy if exists "admins update requests" on public.service_requests;
drop policy if exists "admins manage submissions" on public.submissions;
drop policy if exists "admins read clicks" on public.outbound_clicks;
drop policy if exists "admins read page views" on public.page_views;
create policy "public reads verified events" on public.academic_events for select to anon, authenticated using (status = 'approved' and is_demo = false and verification_status = 'verified' and is_cancelled = false and ((city_id is null and scope_type in ('university','faculty','national')) or exists (select 1 from public.cities c where c.id = city_id and c.enabled and c.public_status = 'published')));
create policy "public reads verified places" on public.places for select to anon, authenticated using (status = 'approved' and is_demo = false and verification_status = 'verified' and exists (select 1 from public.cities c where c.id = city_id and c.enabled and c.public_status = 'published'));
create policy "public reads verified offers" on public.offers for select to anon, authenticated using (status = 'approved' and is_demo = false and verification_status = 'verified' and (valid_to is null or valid_to >= current_date) and exists (select 1 from public.offer_cities oc join public.cities c on c.id = oc.city_id where oc.offer_id = offers.id and c.enabled and c.public_status = 'published'));
create policy "public reads verified jobs" on public.jobs for select to anon, authenticated using (status = 'approved' and is_demo = false and verification_status = 'verified' and (expires_at is null or expires_at >= now()) and (work_location_mode = 'remote' or exists (select 1 from public.cities c where c.id = city_id and c.enabled and c.public_status = 'published')));

drop policy if exists "city staff manage local events" on public.academic_events;
drop policy if exists "city staff manage places" on public.places;
drop policy if exists "city staff manage offers" on public.offers;
drop policy if exists "city staff manage jobs" on public.jobs;
drop policy if exists "city staff read requests" on public.service_requests;
drop policy if exists "city staff update requests" on public.service_requests;
drop policy if exists "city staff manage submissions" on public.submissions;
drop policy if exists "super admins read publication outbox" on public.content_publication_events;
drop policy if exists "city staff read publication outbox" on public.content_publication_events;
drop policy if exists "city staff read clicks" on public.outbound_clicks;
drop policy if exists "city staff read page views" on public.page_views;
create policy "city staff manage local events" on public.academic_events for all to authenticated using (city_id is not null and public.can_manage_city(city_id)) with check (city_id is not null and public.can_manage_city(city_id));
create policy "city staff manage places" on public.places for all to authenticated using (public.can_manage_city(city_id)) with check (public.can_manage_city(city_id));
create policy "city staff manage offers" on public.offers for all to authenticated using (exists (select 1 from public.offer_cities oc where oc.offer_id = offers.id and public.can_manage_city(oc.city_id))) with check (exists (select 1 from public.offer_cities oc where oc.offer_id = offers.id and public.can_manage_city(oc.city_id)));
create policy "city staff manage jobs" on public.jobs for all to authenticated using (city_id is not null and public.can_manage_city(city_id)) with check (city_id is not null and public.can_manage_city(city_id));
create policy "city staff read requests" on public.service_requests for select to authenticated using (public.can_manage_city(city_id));
create policy "city staff update requests" on public.service_requests for update to authenticated using (public.can_manage_city(city_id)) with check (public.can_manage_city(city_id));
create policy "city staff manage submissions" on public.submissions for all to authenticated using (city_id is not null and public.can_manage_city(city_id)) with check (city_id is not null and public.can_manage_city(city_id));
create policy "super admins read publication outbox" on public.content_publication_events for select to authenticated using (public.is_super_admin());
create policy "city staff read publication outbox" on public.content_publication_events for select to authenticated using (city_id is not null and public.can_manage_city(city_id));
create policy "city staff read clicks" on public.outbound_clicks for select to authenticated using (city_id is not null and public.can_manage_city(city_id));
create policy "city staff read page views" on public.page_views for select to authenticated using (city_id is not null and public.can_manage_city(city_id));

drop policy if exists "city staff manage content sources" on public.content_sources;
drop policy if exists "city staff read sync runs" on public.source_sync_runs;
drop policy if exists "city staff manage review queue" on public.source_review_queue;
drop policy if exists "city staff read link checks" on public.link_checks;
create policy "city staff manage content sources" on public.content_sources for all to authenticated using (
  (city_id is not null and public.can_manage_city(city_id)) or
  (city_id is null and source_type = 'academic_calendar' and exists (select 1 from public.university_cities uc where uc.university_id = content_sources.university_id and public.can_manage_city(uc.city_id)))
) with check (
  (city_id is not null and public.can_manage_city(city_id)) or
  (city_id is null and source_type = 'academic_calendar' and exists (select 1 from public.university_cities uc where uc.university_id = content_sources.university_id and public.can_manage_city(uc.city_id)))
);
create policy "city staff read sync runs" on public.source_sync_runs for select to authenticated using (exists (select 1 from public.content_sources s where s.id = source_id and ((s.city_id is not null and public.can_manage_city(s.city_id)) or (s.city_id is null and exists (select 1 from public.university_cities uc where uc.university_id = s.university_id and public.can_manage_city(uc.city_id))))));
create policy "city staff manage review queue" on public.source_review_queue for all to authenticated using (exists (select 1 from public.content_sources s where s.id = source_id and ((s.city_id is not null and public.can_manage_city(s.city_id)) or (s.city_id is null and exists (select 1 from public.university_cities uc where uc.university_id = s.university_id and public.can_manage_city(uc.city_id)))))) with check (exists (select 1 from public.content_sources s where s.id = source_id and ((s.city_id is not null and public.can_manage_city(s.city_id)) or (s.city_id is null and exists (select 1 from public.university_cities uc where uc.university_id = s.university_id and public.can_manage_city(uc.city_id))))));
create policy "city staff read link checks" on public.link_checks for select to authenticated using ((city_id is not null and public.can_manage_city(city_id)) or exists (select 1 from public.content_sources s join public.university_cities uc on uc.university_id = s.university_id where s.id = source_id and public.can_manage_city(uc.city_id)));

revoke all on public.content_publication_events from anon, authenticated;
grant select on public.content_publication_events to authenticated;
grant all on public.content_publication_events to service_role;
