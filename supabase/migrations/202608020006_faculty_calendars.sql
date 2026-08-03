-- Fakultní katalog a bezpečný produkční pipeline harmonogramů.
-- Migrace zachovává existující ID i data; pouze je doplňuje a zpřesňuje.

alter type public.event_category add value if not exists 'internship';

alter table public.universities add column if not exists last_verified_at timestamptz;
update public.universities set last_verified_at = coalesce(last_verified_at, timestamptz '2026-08-02 00:00:00+00');
alter table public.universities alter column last_verified_at set not null;

alter table public.faculties add column if not exists slug text;
alter table public.faculties add column if not exists official_url text;
alter table public.faculties add column if not exists last_verified_at timestamptz;
update public.faculties f set slug = f.id where slug is null;

update public.faculties f set official_url = v.official_url, last_verified_at = timestamptz '2026-08-02 00:00:00+00'
from (values
 ('muni-fi','https://www.fi.muni.cz/'),('muni-prf','https://www.sci.muni.cz/'),('muni-ff','https://www.phil.muni.cz/'),('muni-fss','https://www.fss.muni.cz/'),('muni-esf','https://www.econ.muni.cz/'),('muni-lf','https://www.med.muni.cz/'),('muni-prav','https://www.law.muni.cz/'),('muni-pedf','https://www.ped.muni.cz/'),('muni-fsps','https://www.fsps.muni.cz/'),('muni-faf','https://www.pharm.muni.cz/'),
 ('vut-fekt','https://www.fekt.vut.cz/'),('vut-fit','https://www.fit.vut.cz/'),('vut-fast','https://www.fce.vut.cz/'),('vut-fsi','https://www.fme.vutbr.cz/'),('vut-fa','https://www.fa.vut.cz/'),('vut-fch','https://www.fch.vut.cz/'),('vut-fp','https://www.fp.vut.cz/'),('vut-favu','https://www.favu.vut.cz/'),
 ('mendelu-af','https://af.mendelu.cz/'),('mendelu-ldf','https://ldf.mendelu.cz/'),('mendelu-pef','https://pef.mendelu.cz/'),('mendelu-zf','https://zf.mendelu.cz/'),('mendelu-frrms','https://frrms.mendelu.cz/'),
 ('vetuni-fvl','https://fvl.vetuni.cz/'),('vetuni-fvhe','https://fvhe.vetuni.cz/'),('jamu-hf','https://hf.jamu.cz/'),('jamu-df','https://df.jamu.cz/')
) as v(id, official_url) where f.id = v.id;

alter table public.faculties alter column slug set not null;
alter table public.faculties alter column official_url set not null;
alter table public.faculties alter column last_verified_at set not null;
alter table public.faculties add constraint faculties_slug_format check (slug ~ '^[a-z0-9-]+$');
alter table public.faculties add constraint faculties_official_https check (official_url ~ '^https://');
create unique index if not exists faculties_slug_unique_idx on public.faculties(slug);

alter table public.academic_events add column if not exists programme_id text;
alter table public.academic_events add column if not exists campus_id text references public.campuses(id) on update cascade on delete set null;
alter table public.academic_events add column if not exists source_document_title text;
alter table public.academic_events drop constraint if exists academic_events_scope_type_check;
alter table public.academic_events drop constraint if exists academic_event_scope_valid;
alter table public.academic_events add constraint academic_events_scope_type_check check (scope_type in ('city','university','faculty','programme','campus','national'));
alter table public.academic_events add constraint academic_event_scope_valid check (
  (scope_type = 'city' and city_id is not null and university_id is null and faculty_id is null and programme_id is null) or
  (scope_type = 'national' and university_id is null and faculty_id is null and programme_id is null) or
  (scope_type = 'university' and university_id is not null and faculty_id is null and programme_id is null) or
  (scope_type = 'faculty' and university_id is not null and faculty_id is not null and programme_id is null) or
  (scope_type = 'programme' and university_id is not null and faculty_id is not null and programme_id is not null) or
  (scope_type = 'campus' and city_id is not null and campus_id is not null and programme_id is null)
);

create or replace function public.validate_academic_event_relations() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.faculty_id is not null and not exists (select 1 from public.faculties f where f.id = new.faculty_id and f.university_id = new.university_id and f.is_active) then
    raise exception 'faculty_id does not belong to university_id';
  end if;
  if new.campus_id is not null and not exists (select 1 from public.campuses c where c.id = new.campus_id and c.city_id = new.city_id and c.enabled) then
    raise exception 'campus_id does not belong to city_id';
  end if;
  return new;
end;
$$;
drop trigger if exists academic_event_relations_valid on public.academic_events;
create trigger academic_event_relations_valid before insert or update of university_id, faculty_id, city_id, campus_id on public.academic_events for each row execute function public.validate_academic_event_relations();
create index if not exists academic_events_scope_audience_idx on public.academic_events(city_id, university_id, faculty_id, programme_id, campus_id, starts_at) where status = 'approved';

alter table public.content_sources add column if not exists academic_year text check (academic_year is null or academic_year ~ '^[0-9]{4}/[0-9]{4}$');
alter table public.content_sources add column if not exists normalized_hash text check (normalized_hash is null or normalized_hash ~ '^[a-f0-9]{64}$');
alter table public.content_sources add column if not exists confidence numeric(4,3) not null default 0 check (confidence between 0 and 1);
alter table public.content_sources add column if not exists requires_review boolean not null default true;
alter table public.content_sources add column if not exists notes text not null default '';
alter table public.content_sources add column if not exists source_document_title text;
update public.content_sources set confidence = case when parser_key in ('vut-fit-html','vut-fsi-html','mendelu-pef-html') then 0.92 when sync_status = 'not_found' then 0 else 0.60 end,
  requires_review = parser_key not in ('vut-fit-html','vut-fsi-html','mendelu-pef-html'), notes = terms_note where source_type = 'academic_calendar';

-- Každá aktivní fakulta má registr zdroje. Pokud nebyl nalezen harmonogram,
-- vznikne pouze bezpečný odkaz na oficiální web se stavem not_found; žádná data se negenerují.
insert into public.content_sources (id, university_id, faculty_id, source_type, source_url, official_domain, format, parser_key, enabled, refresh_interval, sync_status, confidence, requires_review, notes, terms_note)
select 'src-' || f.id, f.university_id, f.id, 'academic_calendar', f.official_url,
  split_part(regexp_replace(lower(f.official_url), '^https://(www\.)?', ''), '/', 1), 'html', 'none', false, interval '7 days', 'not_found', 0, true,
  'Veřejný zdroj harmonogramu nenalezen; použita je pouze oficiální stránka fakulty.',
  'Veřejný zdroj harmonogramu nenalezen; data se spravují pouze po ručním ověření.'
from public.faculties f where f.is_active
on conflict (id) do nothing;

alter table public.source_snapshots add column if not exists normalized_hash text check (normalized_hash is null or normalized_hash ~ '^[a-f0-9]{64}$');
alter table public.source_snapshots add column if not exists document_title text;
alter table public.source_snapshots add column if not exists extracted_text text;
alter table public.source_review_queue add column if not exists source_text text;
alter table public.source_review_queue add column if not exists confidence numeric(4,3) check (confidence is null or confidence between 0 and 1);
alter table public.source_review_queue add column if not exists source_document_title text;

create table if not exists public.source_change_audits (
  id bigint generated always as identity primary key,
  source_id text not null references public.content_sources(id) on update cascade on delete cascade,
  sync_run_id uuid references public.source_sync_runs(id) on delete set null,
  previous_content_hash text,
  content_hash text not null,
  previous_normalized_hash text,
  normalized_hash text,
  inserted_count integer not null default 0,
  changed_count integer not null default 0,
  cancelled_count integer not null default 0,
  requires_review boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists source_change_audits_source_created_idx on public.source_change_audits(source_id, created_at desc);
alter table public.source_change_audits enable row level security;
create policy "city staff read source audits" on public.source_change_audits for select to authenticated using (exists (select 1 from public.content_sources s where s.id = source_id and ((s.city_id is not null and public.can_manage_city(s.city_id)) or (s.city_id is null and exists (select 1 from public.university_cities uc where uc.university_id = s.university_id and public.can_manage_city(uc.city_id))))));
grant select on public.source_change_audits to authenticated;
