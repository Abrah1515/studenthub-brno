-- StudentHub Brno: PostgreSQL schema, indexes, triggers and RLS.
-- gen_random_uuid() je součástí podporovaných moderních PostgreSQL verzí; schéma nevyžaduje volitelné rozšíření.

create type public.content_status as enum ('draft', 'pending', 'approved', 'rejected', 'archived');
create type public.event_category as enum ('teaching', 'holiday', 'exam', 'registration', 'other');
create type public.place_category as enum ('study_room', 'library', 'canteen', 'print', 'cafe', 'sport', 'service', 'other');
create type public.submission_type as enum ('job', 'offer', 'place', 'event', 'report');
create type public.request_status as enum ('new', 'contacted', 'in_progress', 'resolved', 'closed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 100),
  role text not null default 'user' check (role in ('user', 'editor', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.academic_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 180),
  description text not null default '',
  category public.event_category not null default 'other',
  school text not null,
  faculty text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  source_name text not null,
  source_url text,
  source_updated_at timestamptz,
  status public.content_status not null default 'draft',
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_events_dates check (ends_at is null or ends_at >= starts_at)
);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  category public.place_category not null default 'other',
  description text not null default '',
  address text not null,
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  opening_hours text,
  website_url text,
  status public.content_status not null default 'draft',
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 180),
  description text not null default '',
  category text not null,
  partner_name text not null,
  discount_label text,
  conditions text not null default '',
  destination_url text not null,
  valid_from date,
  valid_to date,
  is_featured boolean not null default false,
  is_sponsored boolean not null default false,
  is_affiliate boolean not null default false,
  status public.content_status not null default 'draft',
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offer_dates check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 180),
  company_name text not null,
  field text not null,
  work_type text not null,
  location text not null,
  reward_amount integer not null check (reward_amount >= 0),
  reward_unit text not null default 'hour' check (reward_unit in ('hour', 'shift', 'month', 'fixed')),
  workload text not null,
  description text not null,
  contact_public text,
  apply_url text,
  is_featured boolean not null default false,
  status public.content_status not null default 'pending',
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  email text,
  phone text,
  service_type text not null,
  description text not null check (char_length(description) between 20 and 2000),
  preferred_date date not null,
  consent_at timestamptz not null,
  status public.request_status not null default 'new',
  internal_note text,
  source text not null default 'web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_request_contact check (nullif(email, '') is not null or nullif(phone, '') is not null)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  type public.submission_type not null,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  submitter_contact text,
  consent_at timestamptz,
  status public.content_status not null default 'pending',
  moderation_note text,
  moderated_by uuid references public.profiles(id),
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.outbound_clicks (
  id bigint generated always as identity primary key,
  target_type text not null check (target_type in ('offer', 'job', 'affiliate')),
  target_id text not null,
  destination_host text not null,
  clicked_at timestamptz not null default now(),
  day_bucket date not null default current_date
);

create index academic_events_public_date_idx on public.academic_events (starts_at, category) where status = 'approved';
create index academic_events_school_faculty_idx on public.academic_events (school, faculty);
create index places_public_category_idx on public.places (category, name) where status = 'approved';
create index places_coordinates_idx on public.places (latitude, longitude);
create index offers_public_validity_idx on public.offers (is_featured desc, valid_to) where status = 'approved';
create index jobs_public_reward_idx on public.jobs (field, work_type, reward_amount desc) where status = 'approved';
create index service_requests_status_created_idx on public.service_requests (status, created_at desc);
create index submissions_status_created_idx on public.submissions (status, created_at desc);
create index outbound_clicks_target_day_idx on public.outbound_clicks (target_type, target_id, day_bucket);

create or replace function public.set_updated_at() returns trigger language plpgsql security invoker set search_path = '' as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger events_updated before update on public.academic_events for each row execute function public.set_updated_at();
create trigger places_updated before update on public.places for each row execute function public.set_updated_at();
create trigger offers_updated before update on public.offers for each row execute function public.set_updated_at();
create trigger jobs_updated before update on public.jobs for each row execute function public.set_updated_at();
create trigger requests_updated before update on public.service_requests for each row execute function public.set_updated_at();
create trigger submissions_updated before update on public.submissions for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$ begin insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'); $$;

alter table public.profiles enable row level security;
alter table public.academic_events enable row level security;
alter table public.places enable row level security;
alter table public.offers enable row level security;
alter table public.jobs enable row level security;
alter table public.service_requests enable row level security;
alter table public.submissions enable row level security;
alter table public.outbound_clicks enable row level security;

create policy "profiles own read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles own update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
create policy "public reads approved events" on public.academic_events for select to anon, authenticated using (status = 'approved');
create policy "public reads approved places" on public.places for select to anon, authenticated using (status = 'approved');
create policy "public reads approved offers" on public.offers for select to anon, authenticated using (status = 'approved');
create policy "public reads approved jobs" on public.jobs for select to anon, authenticated using (status = 'approved');
create policy "admins manage events" on public.academic_events for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage places" on public.places for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage offers" on public.offers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage jobs" on public.jobs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "anonymous creates requests" on public.service_requests for insert to anon, authenticated with check (consent_at is not null and status = 'new');
create policy "admins read requests" on public.service_requests for select to authenticated using (public.is_admin());
create policy "admins update requests" on public.service_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "anonymous creates submissions" on public.submissions for insert to anon, authenticated with check (status = 'pending');
create policy "admins manage submissions" on public.submissions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "anonymous records clicks" on public.outbound_clicks for insert to anon, authenticated with check (clicked_at <= now() + interval '1 minute');
create policy "admins read clicks" on public.outbound_clicks for select to authenticated using (public.is_admin());

revoke all on public.service_requests from anon;
grant insert on public.service_requests to anon;
revoke all on public.submissions from anon;
grant insert on public.submissions to anon;
revoke all on public.outbound_clicks from anon;
grant insert on public.outbound_clicks to anon;
