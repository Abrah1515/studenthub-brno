-- Rozšíření StudentHub Brno na více univerzit. Navazuje bezpečně na 001.
create table public.universities (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null unique,
  short_name text not null,
  city text not null default 'Brno',
  website_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.faculties (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  university_id text not null references public.universities(id) on update cascade on delete restrict,
  name text not null,
  short_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (university_id, name)
);

insert into public.universities (id, slug, name, short_name, website_url) values
('muni', 'muni', 'Masarykova univerzita', 'MUNI', 'https://www.muni.cz/'),
('vut', 'vut', 'Vysoké učení technické v Brně', 'VUT', 'https://www.vut.cz/'),
('mendelu', 'mendelu', 'Mendelova univerzita v Brně', 'MENDELU', 'https://mendelu.cz/'),
('vetuni', 'vetuni', 'Veterinární univerzita Brno', 'VETUNI', 'https://www.vetuni.cz/'),
('jamu', 'jamu', 'Janáčkova akademie múzických umění', 'JAMU', 'https://www.jamu.cz/');

insert into public.faculties (id, university_id, name, short_name) values
('muni-fi','muni','Fakulta informatiky','FI'), ('muni-prf','muni','Přírodovědecká fakulta','PřF'), ('muni-ff','muni','Filozofická fakulta','FF'), ('muni-fss','muni','Fakulta sociálních studií','FSS'), ('muni-esf','muni','Ekonomicko-správní fakulta','ESF'), ('muni-lf','muni','Lékařská fakulta','LF'), ('muni-prav','muni','Právnická fakulta','PrF'), ('muni-pedf','muni','Pedagogická fakulta','PdF'), ('muni-fsps','muni','Fakulta sportovních studií','FSpS'), ('muni-faf','muni','Farmaceutická fakulta','FaF'),
('vut-fekt','vut','Fakulta elektrotechniky a komunikačních technologií','FEKT'), ('vut-fit','vut','Fakulta informačních technologií','FIT'), ('vut-fast','vut','Fakulta stavební','FAST'), ('vut-fsi','vut','Fakulta strojního inženýrství','FSI'), ('vut-fa','vut','Fakulta architektury','FA'), ('vut-fch','vut','Fakulta chemická','FCH'), ('vut-fp','vut','Fakulta podnikatelská','FP'), ('vut-favu','vut','Fakulta výtvarných umění','FaVU'),
('mendelu-af','mendelu','Agronomická fakulta','AF'), ('mendelu-ldf','mendelu','Lesnická a dřevařská fakulta','LDF'), ('mendelu-pef','mendelu','Provozně ekonomická fakulta','PEF'), ('mendelu-zf','mendelu','Zahradnická fakulta','ZF'), ('mendelu-frrms','mendelu','Fakulta regionálního rozvoje a mezinárodních studií','FRRMS'),
('vetuni-fvl','vetuni','Fakulta veterinárního lékařství','FVL'), ('vetuni-fvhe','vetuni','Fakulta veterinární hygieny a ekologie','FVHE'),
('jamu-hf','jamu','Hudební fakulta','HF'), ('jamu-df','jamu','Divadelní fakulta','DF');

alter table public.profiles add column university_id text references public.universities(id);
alter table public.profiles add column faculty_id text references public.faculties(id);
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'faculty_editor', 'admin'));

alter table public.academic_events add column scope_type text not null default 'brno' check (scope_type in ('brno', 'university', 'faculty'));
alter table public.academic_events add column university_id text references public.universities(id);
alter table public.academic_events add column faculty_id text references public.faculties(id);
alter table public.academic_events add constraint academic_event_scope_valid check ((scope_type = 'brno' and university_id is null and faculty_id is null) or (scope_type = 'university' and university_id is not null and faculty_id is null) or (scope_type = 'faculty' and university_id is not null and faculty_id is not null));

alter table public.places add column university_id text references public.universities(id);
alter table public.places add column faculty_id text references public.faculties(id);
alter table public.places add column campus_name text;
alter table public.offers add column university_id text references public.universities(id);
alter table public.offers add column faculty_id text references public.faculties(id);
alter table public.offers add column campus_name text;
alter table public.offers add column latitude numeric(9,6) check (latitude between -90 and 90);
alter table public.offers add column longitude numeric(9,6) check (longitude between -180 and 180);
alter table public.jobs add column university_id text references public.universities(id);
alter table public.jobs add column faculty_id text references public.faculties(id);
alter table public.submissions add column university_id text references public.universities(id);
alter table public.submissions add column faculty_id text references public.faculties(id);
alter table public.submissions add column organization_name text;

create table public.offer_universities (
  offer_id uuid not null references public.offers(id) on delete cascade,
  university_id text not null references public.universities(id) on delete cascade,
  primary key (offer_id, university_id)
);
create table public.offer_faculties (
  offer_id uuid not null references public.offers(id) on delete cascade,
  faculty_id text not null references public.faculties(id) on delete cascade,
  primary key (offer_id, faculty_id)
);

alter table public.outbound_clicks add column university_id text references public.universities(id);
alter table public.outbound_clicks add column faculty_id text references public.faculties(id);
alter table public.outbound_clicks add column referral_code text;

create table public.community_referrals (
  code text primary key check (code ~ '^[a-z0-9-]{2,80}$'),
  university_id text references public.universities(id),
  faculty_id text references public.faculties(id),
  organization_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.community_referrals (code, university_id, organization_name) values
('muni-studenti','muni','Obecná komunita MUNI'), ('vut-studenti','vut','Obecná komunita VUT'), ('mendelu-studenti','mendelu','Obecná komunita MENDELU'), ('vetuni-studenti','vetuni','Obecná komunita VETUNI'), ('jamu-studenti','jamu','Obecná komunita JAMU');

create table public.page_views (
  id bigint generated always as identity primary key,
  path text not null check (left(path, 1) = '/'),
  university_id text references public.universities(id),
  faculty_id text references public.faculties(id),
  referral_code text,
  viewed_at timestamptz not null default now(),
  day_bucket date not null default current_date
);

create index faculties_university_idx on public.faculties (university_id, short_name);
create index events_university_faculty_date_idx on public.academic_events (university_id, faculty_id, starts_at) where status = 'approved';
create index places_university_faculty_idx on public.places (university_id, faculty_id, category) where status = 'approved';
create index jobs_university_faculty_idx on public.jobs (university_id, faculty_id, reward_amount desc) where status = 'approved';
create index submissions_university_faculty_idx on public.submissions (university_id, faculty_id, status, created_at desc);
create index page_views_school_day_idx on public.page_views (university_id, faculty_id, day_bucket);
create index page_views_referral_day_idx on public.page_views (referral_code, day_bucket);

create or replace function public.is_content_editor() returns boolean language sql stable security definer set search_path = '' as $$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('faculty_editor', 'admin')); $$;
create or replace function public.editor_faculty_id() returns text language sql stable security definer set search_path = '' as $$ select faculty_id from public.profiles where id = auth.uid() and role = 'faculty_editor'; $$;

alter table public.universities enable row level security;
alter table public.faculties enable row level security;
alter table public.offer_universities enable row level security;
alter table public.offer_faculties enable row level security;
alter table public.community_referrals enable row level security;
alter table public.page_views enable row level security;

create policy "public reads active universities" on public.universities for select to anon, authenticated using (is_active);
create policy "public reads active faculties" on public.faculties for select to anon, authenticated using (is_active);
create policy "public reads offer university links" on public.offer_universities for select to anon, authenticated using (exists (select 1 from public.offers where id = offer_id and status = 'approved'));
create policy "public reads offer faculty links" on public.offer_faculties for select to anon, authenticated using (exists (select 1 from public.offers where id = offer_id and status = 'approved'));
create policy "public reads active referrals" on public.community_referrals for select to anon, authenticated using (is_active);
create policy "anonymous records consented page views" on public.page_views for insert to anon, authenticated with check (viewed_at <= now() + interval '1 minute');
create policy "admins read page views" on public.page_views for select to authenticated using (public.is_admin());

create policy "faculty editors manage scoped events" on public.academic_events for all to authenticated using (faculty_id = public.editor_faculty_id()) with check (faculty_id = public.editor_faculty_id());
create policy "faculty editors manage scoped places" on public.places for all to authenticated using (faculty_id = public.editor_faculty_id()) with check (faculty_id = public.editor_faculty_id());
create policy "faculty editors manage scoped offers" on public.offers for all to authenticated using (faculty_id = public.editor_faculty_id()) with check (faculty_id = public.editor_faculty_id());
create policy "faculty editors manage scoped jobs" on public.jobs for all to authenticated using (faculty_id = public.editor_faculty_id()) with check (faculty_id = public.editor_faculty_id());
create policy "faculty editors moderate scoped submissions" on public.submissions for select to authenticated using (faculty_id = public.editor_faculty_id());
create policy "faculty editors update scoped submissions" on public.submissions for update to authenticated using (faculty_id = public.editor_faculty_id()) with check (faculty_id = public.editor_faculty_id());

grant select on public.universities, public.faculties, public.offer_universities, public.offer_faculties, public.community_referrals to anon, authenticated;
grant insert on public.page_views to anon, authenticated;
