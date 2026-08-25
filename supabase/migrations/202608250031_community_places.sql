-- Community place proposals and student experiences. Personal author data stays
-- in profiles; public place rows contain only moderated, non-personal content.

alter type public.place_category add value if not exists 'restaurant';
alter type public.place_category add value if not exists 'pub_bar';
alter type public.place_category add value if not exists 'fast_food';
alter type public.place_category add value if not exists 'coworking';
alter type public.place_category add value if not exists 'public_toilet';
alter type public.place_category add value if not exists 'student_service';

alter table public.places
  add column if not exists origin text not null default 'official'
    check (origin in ('official','community')),
  add column if not exists community_submission_id uuid,
  add column if not exists community_approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists community_approved_at timestamptz,
  add column if not exists community_last_reviewed_at timestamptz,
  add column if not exists study_suitable boolean,
  add column if not exists wifi_available boolean,
  add column if not exists outlets_available boolean,
  add column if not exists accessibility text
    check (accessibility is null or accessibility in ('accessible','limited','unknown'));

create table public.place_submissions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete restrict,
  city_id text not null default 'brno' references public.cities(id) on update cascade on delete restrict,
  submission_type text not null default 'new' check (submission_type in ('new','correction')),
  target_place_id uuid references public.places(id) on delete set null,
  name text not null check (char_length(name) between 2 and 160),
  category public.place_category not null,
  address text not null check (char_length(address) between 3 and 240),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  location_confirmed_at timestamptz not null,
  description text not null check (char_length(description) between 20 and 2000),
  usefulness_reason text not null check (char_length(usefulness_reason) between 10 and 1000),
  source_url text not null check (source_url ~ '^https://[^[:space:]]+$'),
  opening_hours text check (opening_hours is null or char_length(opening_hours) <= 600),
  price_level text check (price_level is null or price_level in ('free','low','medium','high','varies')),
  access_conditions text check (access_conditions is null or char_length(access_conditions) <= 800),
  study_suitable boolean,
  wifi_available boolean,
  outlets_available boolean,
  accessibility text check (accessibility is null or accessibility in ('accessible','limited','unknown')),
  status text not null default 'pending'
    check (status in ('draft','pending','changes_requested','approved','rejected','withdrawn','merged','archived')),
  duplicate_of_place_id uuid references public.places(id) on delete set null,
  published_place_id uuid references public.places(id) on delete set null,
  author_consent_at timestamptz not null,
  photo_rights_confirmed_at timestamptz not null,
  moderator_notes text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (submission_type = 'correction' or target_place_id is null),
  check (submission_type = 'new' or target_place_id is not null),
  check (status = 'draft' or submitted_at is not null)
);

alter table public.places
  drop constraint if exists places_community_submission_id_fkey;
alter table public.places
  add constraint places_community_submission_id_fkey foreign key (community_submission_id)
  references public.place_submissions(id) on delete set null;

create table public.place_submission_photos (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.place_submissions(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  width integer not null check (width between 320 and 6000),
  height integer not null check (height between 240 and 6000),
  byte_size integer not null check (byte_size between 1 and 8388608),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  sort_order smallint not null default 0 check (sort_order between 0 and 9),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (submission_id,sort_order)
);

create table public.place_submission_history (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.place_submissions(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('drafted','submitted','edited','withdrawn','changes_requested','approved','rejected','merged','hidden','archived')),
  reason text not null default '',
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now()
);

create table public.place_aliases (
  id bigint generated always as identity primary key,
  place_id uuid not null references public.places(id) on delete cascade,
  alias text not null check (char_length(alias) between 2 and 160),
  normalized_alias text not null,
  created_at timestamptz not null default now(),
  unique (place_id,normalized_alias)
);

create table public.place_comments (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 2 and 600),
  status text not null default 'active' check (status in ('active','hidden','deleted')),
  helpful_count integer not null default 0 check (helpful_count >= 0),
  report_count integer not null default 0 check (report_count >= 0),
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.place_comment_traits (
  comment_id uuid not null references public.place_comments(id) on delete cascade,
  trait text not null check (trait in ('quiet_study','group_work','good_wifi','many_outlets','low_price','accessible','evening_open','good_food')),
  created_at timestamptz not null default now(),
  primary key (comment_id,trait)
);

create table public.place_comment_helpful (
  comment_id uuid not null references public.place_comments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id,profile_id)
);

create table public.place_comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.place_comments(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','privacy','unsafe_link','false_information','other')),
  detail text not null default '' check (char_length(detail) <= 800),
  status text not null default 'new' check (status in ('new','reviewed','dismissed','actioned')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (comment_id,reporter_id)
);

create table public.place_moderation_actions (
  id bigint generated always as identity primary key,
  city_id text not null references public.cities(id) on update cascade on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('submission','place','comment','report','author')),
  target_id text not null,
  action text not null,
  reason text not null default '',
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now()
);

create index place_submissions_author_idx on public.place_submissions(author_id,created_at desc);
create index place_submissions_moderation_idx on public.place_submissions(city_id,status,submitted_at desc);
create index place_submissions_position_idx on public.place_submissions(city_id,latitude,longitude);
create index place_comments_place_idx on public.place_comments(place_id,created_at desc) where status = 'active';
create index place_comments_author_idx on public.place_comments(author_id,created_at desc);
create index place_comment_reports_queue_idx on public.place_comment_reports(status,created_at desc);
create index place_moderation_actions_target_idx on public.place_moderation_actions(target_type,target_id,created_at desc);
create index places_public_filter_idx on public.places(city_id,category,origin,status) where status = 'approved' and is_demo = false;

create or replace function public.refresh_place_comment_helpful_count()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target uuid := coalesce(new.comment_id,old.comment_id);
begin
  update public.place_comments set helpful_count=(select count(*) from public.place_comment_helpful where comment_id=target) where id=target;
  return coalesce(new,old);
end;
$$;
create trigger place_comment_helpful_refresh after insert or delete on public.place_comment_helpful
for each row execute function public.refresh_place_comment_helpful_count();

create or replace function public.refresh_place_comment_report_count()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target uuid := coalesce(new.comment_id,old.comment_id);
declare total integer;
begin
  select count(*)::integer into total from public.place_comment_reports where comment_id=target and status in ('new','reviewed','actioned');
  update public.place_comments set report_count=total,status=case when total >= 3 and status='active' then 'hidden' else status end where id=target;
  return coalesce(new,old);
end;
$$;
create trigger place_comment_report_refresh after insert or delete or update of status on public.place_comment_reports
for each row execute function public.refresh_place_comment_report_count();

create or replace function public.protect_place_comment_author_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_user <> 'service_role' and pg_trigger_depth() <= 1 and not public.can_manage_city((select p.city_id from public.places p where p.id=old.place_id)) then
    if new.author_id is distinct from old.author_id or new.place_id is distinct from old.place_id
      or new.helpful_count is distinct from old.helpful_count or new.report_count is distinct from old.report_count
      or new.status not in ('active','deleted') then raise exception 'protected place comment fields cannot be changed'; end if;
    if new.body is distinct from old.body then new.edited_at := now(); end if;
  end if;
  return new;
end;
$$;
create trigger place_comments_protect before update on public.place_comments
for each row execute function public.protect_place_comment_author_fields();

create trigger place_submissions_updated before update on public.place_submissions
for each row execute function public.set_updated_at();
create trigger place_comments_updated before update on public.place_comments
for each row execute function public.set_updated_at();

alter table public.place_submissions enable row level security;
alter table public.place_submission_photos enable row level security;
alter table public.place_submission_history enable row level security;
alter table public.place_aliases enable row level security;
alter table public.place_comments enable row level security;
alter table public.place_comment_traits enable row level security;
alter table public.place_comment_helpful enable row level security;
alter table public.place_comment_reports enable row level security;
alter table public.place_moderation_actions enable row level security;

create policy "authors read own place submissions" on public.place_submissions for select to authenticated
  using (author_id=auth.uid());
create policy "city staff read place submissions" on public.place_submissions for select to authenticated
  using (public.can_manage_city(city_id));
create policy "authors read own place submission photos" on public.place_submission_photos for select to authenticated
  using (exists (select 1 from public.place_submissions s where s.id=submission_id and s.author_id=auth.uid()));
create policy "public reads published place photos" on public.place_submission_photos for select to anon,authenticated
  using (is_published and exists (select 1 from public.place_submissions s join public.places p on p.id=s.published_place_id where s.id=submission_id and p.status='approved' and p.verification_status='verified' and not p.is_demo));
create policy "city staff read place submission photos" on public.place_submission_photos for select to authenticated
  using (exists (select 1 from public.place_submissions s where s.id=submission_id and public.can_manage_city(s.city_id)));
create policy "authors read own place history" on public.place_submission_history for select to authenticated
  using (exists (select 1 from public.place_submissions s where s.id=submission_id and s.author_id=auth.uid()));
create policy "city staff read place history" on public.place_submission_history for select to authenticated
  using (exists (select 1 from public.place_submissions s where s.id=submission_id and public.can_manage_city(s.city_id)));
create policy "public reads place aliases" on public.place_aliases for select to anon,authenticated
  using (exists (select 1 from public.places p where p.id=place_id and p.status='approved' and p.verification_status='verified' and not p.is_demo));
create policy "public reads active place comments" on public.place_comments for select to anon,authenticated
  using (status='active' and exists (select 1 from public.places p where p.id=place_id and p.status='approved' and p.verification_status='verified' and not p.is_demo));
create policy "authors read own place comments" on public.place_comments for select to authenticated using (author_id=auth.uid());
create policy "public reads active place traits" on public.place_comment_traits for select to anon,authenticated
  using (exists (select 1 from public.place_comments c where c.id=comment_id and c.status='active'));
create policy "authors read own helpful votes" on public.place_comment_helpful for select to authenticated using (profile_id=auth.uid());
create policy "reporters read own place reports" on public.place_comment_reports for select to authenticated using (reporter_id=auth.uid());
create policy "city staff read place reports" on public.place_comment_reports for select to authenticated
  using (exists (select 1 from public.place_comments c join public.places p on p.id=c.place_id where c.id=comment_id and public.can_manage_city(p.city_id)));
create policy "city staff read place moderation audit" on public.place_moderation_actions for select to authenticated using (public.can_manage_city(city_id));

revoke all on public.place_submissions,public.place_submission_photos,public.place_submission_history,public.place_aliases,public.place_comments,public.place_comment_traits,public.place_comment_helpful,public.place_comment_reports,public.place_moderation_actions from anon,authenticated;
revoke select on public.places from anon,authenticated;
grant select (id,name,category,description,address,latitude,longitude,opening_hours,website_url,status,is_demo,created_at,updated_at,university_id,faculty_id,city_id,source_url,last_verified_at,verification_status,osm_type,osm_id,why_visit,price_level,student_discount,opening_hours_verified_at,source_external_id,dedupe_key,access_conditions,source_sync_status,source_checked_at,source_final_url,source_content_type,origin,community_approved_at,community_last_reviewed_at,study_suitable,wifi_available,outlets_available,accessibility) on public.places to anon,authenticated;
grant select on public.place_aliases to anon,authenticated;
grant select (id,place_id,body,status,helpful_count,edited_at,created_at,updated_at) on public.place_comments to anon,authenticated;
grant select (comment_id,trait,created_at) on public.place_comment_traits to anon,authenticated;
grant select (id,submission_id,width,height,sort_order,is_published,created_at) on public.place_submission_photos to anon,authenticated;
grant select on public.place_submissions to authenticated;
grant select (id,submission_id,action,reason,created_at) on public.place_submission_history to authenticated;
grant select (comment_id,profile_id,created_at) on public.place_comment_helpful to authenticated;
grant select (id,comment_id,reporter_id,reason,detail,status,reviewed_at,created_at) on public.place_comment_reports to authenticated;
grant select on public.place_moderation_actions to authenticated;
grant all on public.place_submissions,public.place_submission_photos,public.place_submission_history,public.place_aliases,public.place_comments,public.place_comment_traits,public.place_comment_helpful,public.place_comment_reports,public.place_moderation_actions to service_role;
grant usage,select on sequence public.place_submission_history_id_seq,public.place_aliases_id_seq,public.place_moderation_actions_id_seq to service_role;

do $$ begin
  if to_regclass('storage.buckets') is not null then
    execute $sql$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
      values ('place-submission-images','place-submission-images',false,8388608,array['image/jpeg','image/png','image/webp'])
      on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types$sql$;
  end if;
end $$;

comment on table public.place_submissions is 'Neveřejná fronta komunitních návrhů míst; autor je dostupný pouze autorovi a oprávněným moderátorům.';
comment on table public.place_comments is 'Veřejné zkušenosti ověřených profilů bez hvězdičkového hodnocení.';
comment on column public.places.origin is 'Původ veřejného záznamu; community se zobrazuje s viditelným označením.';
