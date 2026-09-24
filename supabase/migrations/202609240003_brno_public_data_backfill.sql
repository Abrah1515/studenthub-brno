-- Rozšíření produkčního katalogu akcí a míst o ověřitelná městská data.
-- Samotná data zapisuje idempotentní scripts/backfill-brno-public-data.mjs.

alter type public.place_category add value if not exists 'drinking_fountain';
alter type public.place_category add value if not exists 'park';
alter type public.place_category add value if not exists 'bench';
alter type public.place_category add value if not exists 'counselling';

alter table public.places
  add column if not exists public_access boolean,
  add column if not exists student_only boolean,
  add column if not exists source_license text,
  add column if not exists source_dataset_updated_at timestamptz;

alter table public.community_events
  add column if not exists university_id text references public.universities(id) on update cascade on delete set null,
  add column if not exists faculty_id text references public.faculties(id) on update cascade on delete set null,
  add column if not exists attendance_mode text not null default 'in_person',
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add column if not exists registration_url text;

alter table public.community_events drop constraint if exists community_events_category_check;
alter table public.community_events drop constraint if exists community_events_attendance_mode_check;
alter table public.community_events add constraint community_events_attendance_mode_check
  check (attendance_mode in ('in_person','online','hybrid'));
alter table public.community_events drop constraint if exists community_events_registration_url_check;
alter table public.community_events add constraint community_events_registration_url_check
  check (registration_url is null or registration_url ~ '^https://');

update public.community_events set category = case category
  when 'Studium' then 'Studium a vzdělávání'
  when 'Sport' then 'Sport a pohyb'
  when 'Zábava' then 'Párty a společenské akce'
  else category end
where category in ('Studium','Sport','Zábava');

create or replace function public.normalize_community_event_category() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.category := case new.category
    when 'Studium' then 'Studium a vzdělávání'
    when 'Sport' then 'Sport a pohyb'
    when 'Zábava' then 'Párty a společenské akce'
    else new.category end;
  return new;
end;
$$;
drop trigger if exists community_events_normalize_category on public.community_events;
create trigger community_events_normalize_category before insert or update of category
  on public.community_events for each row execute function public.normalize_community_event_category();

alter table public.community_events add constraint community_events_category_check check (category in (
  'Studium a vzdělávání','Seznamovací akce','Studentské spolky','Kultura',
  'Hudba a koncerty','Párty a společenské akce','Sport a pohyb','Kariéra a brigády',
  'Workshop a přednáška','Technologie a věda','Dobrovolnictví','Wellbeing a zdraví',
  'Výlet','Ostatní'
));

create index if not exists community_events_public_filters_idx
  on public.community_events(city_id,university_id,faculty_id,attendance_mode,starts_at)
  where status='published';
create index if not exists places_map_layer_idx
  on public.places(city_id,category,latitude,longitude)
  where status='approved' and is_demo=false;

revoke all on public.places from anon, authenticated;
grant select (id,name,category,description,address,latitude,longitude,opening_hours,website_url,status,is_demo,created_at,updated_at,university_id,faculty_id,city_id,source_url,last_verified_at,verification_status,osm_type,osm_id,why_visit,price_level,student_discount,opening_hours_verified_at,source_external_id,dedupe_key,access_conditions,source_sync_status,source_checked_at,source_final_url,source_content_type,origin,community_approved_at,community_last_reviewed_at,study_suitable,wifi_available,outlets_available,accessibility,public_access,student_only,source_license,source_dataset_updated_at)
  on public.places to anon, authenticated;
