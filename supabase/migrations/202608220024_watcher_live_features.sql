-- Device-scoped favourites, reminders, push delivery, live calendar subscriptions,
-- community interest, crowd place status and durable academic change history.
-- All device identifiers and push endpoints stay behind the server API.

alter type public.event_category add value if not exists 'seminar_enrollment';
alter type public.event_category add value if not exists 'final_exam_application';
alter type public.event_category add value if not exists 'dean_rector_leave';

alter table public.academic_events
  add column if not exists revision_sequence integer not null default 0 check (revision_sequence >= 0),
  add column if not exists previous_verified_data jsonb,
  add column if not exists changed_at timestamptz;

alter table public.community_events
  add column if not exists interest_count integer not null default 0 check (interest_count >= 0),
  add column if not exists interest_last_24h integer not null default 0 check (interest_last_24h >= 0);

alter table public.places
  add column if not exists access_conditions text,
  add column if not exists source_sync_status text not null default 'verified'
    check (source_sync_status in ('verified','needs_review','unavailable')),
  add column if not exists source_checked_at timestamptz,
  add column if not exists source_miss_count integer not null default 0 check (source_miss_count >= 0),
  add column if not exists source_final_url text,
  add column if not exists source_content_type text,
  add column if not exists proposed_source_data jsonb;

alter table public.service_requests
  add column if not exists public_alias text not null default 'Student/ka'
    check (char_length(public_alias) between 2 and 60),
  add column if not exists publish_consent_at timestamptz;
alter table public.service_requests alter column moderation_status set default 'approved';

create table if not exists public.anonymous_installations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid references public.profiles(id) on delete set null,
  city_id text not null default 'brno' references public.cities(id) on update cascade on delete restrict,
  university_id text references public.universities(id) on update cascade on delete set null,
  faculty_id text references public.faculties(id) on update cascade on delete set null,
  study_year smallint check (study_year is null or study_year between 1 and 6),
  muted_categories text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  check (faculty_id is null or university_id is not null)
);
create index if not exists anonymous_installations_scope_idx
  on public.anonymous_installations(city_id,university_id,faculty_id,study_year);

create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.anonymous_installations(id) on delete cascade,
  target_type text not null check (target_type in ('academic_event','community_event')),
  target_id uuid not null,
  is_favorite boolean not null default false,
  is_watched boolean not null default false,
  reminder_days smallint[] not null default '{7,3,1,0}'
    check (reminder_days <@ array[0,1,3,7]::smallint[]),
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  event_starts_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (installation_id,target_type,target_id),
  check (is_favorite or is_watched)
);
create index if not exists saved_items_due_idx on public.saved_items(is_watched,event_starts_at);

create table if not exists public.internal_notifications (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.anonymous_installations(id) on delete cascade,
  target_type text not null check (target_type in ('academic_event','community_event','system')),
  target_id uuid,
  kind text not null check (kind in ('reminder','academic_change','new_important_term','system')),
  title text not null check (char_length(title) between 3 and 180),
  body text not null check (char_length(body) between 3 and 1000),
  destination_url text not null default '/hlidac' check (destination_url like '/%'),
  dedupe_key text not null,
  available_at timestamptz not null default now(),
  read_at timestamptz,
  push_sent_at timestamptz,
  push_attempts integer not null default 0 check (push_attempts >= 0),
  last_push_error text,
  created_at timestamptz not null default now(),
  unique (installation_id,dedupe_key)
);
create index if not exists internal_notifications_inbox_idx
  on public.internal_notifications(installation_id,read_at,available_at desc);
create index if not exists internal_notifications_push_idx
  on public.internal_notifications(available_at,push_sent_at) where push_sent_at is null;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.anonymous_installations(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  endpoint_hash text not null unique check (endpoint_hash ~ '^[a-f0-9]{64}$'),
  p256dh text not null,
  auth_secret text not null,
  enabled boolean not null default true,
  expiration_time bigint,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_installation_idx
  on public.push_subscriptions(installation_id) where enabled;

create table if not exists public.calendar_subscriptions (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.anonymous_installations(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  city_id text not null references public.cities(id) on update cascade on delete restrict,
  university_id text references public.universities(id) on update cascade on delete set null,
  faculty_id text references public.faculties(id) on update cascade on delete set null,
  study_year smallint check (study_year is null or study_year between 1 and 6),
  category text,
  is_active boolean not null default true,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (faculty_id is null or university_id is not null)
);
create index if not exists calendar_subscriptions_installation_idx
  on public.calendar_subscriptions(installation_id,is_active);

create table if not exists public.community_event_interests (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.community_events(id) on delete cascade,
  installation_id uuid not null references public.anonymous_installations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id,installation_id)
);
create index if not exists community_event_interests_growth_idx
  on public.community_event_interests(event_id,created_at desc);

create table if not exists public.place_live_reports (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  installation_id uuid not null references public.anonymous_installations(id) on delete cascade,
  status text not null check (status in ('no_queue','short_queue','long_queue','closed','many_seats','partly_occupied','almost_full')),
  report_window timestamptz not null,
  reported_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '60 minutes'),
  proximity_band text check (proximity_band is null or proximity_band in ('near','unknown')),
  is_suspicious boolean not null default false,
  hidden_at timestamptz,
  hidden_by uuid references public.profiles(id) on delete set null,
  unique (place_id,installation_id,report_window),
  check (expires_at <= reported_at + interval '61 minutes')
);
create index if not exists place_live_reports_fresh_idx
  on public.place_live_reports(place_id,expires_at desc) where hidden_at is null;

create table if not exists public.academic_event_changes (
  id uuid primary key default gen_random_uuid(),
  academic_event_id uuid not null references public.academic_events(id) on delete cascade,
  source_id text references public.content_sources(id) on update cascade on delete set null,
  change_type text not null check (change_type in ('created','date','time','description','cancelled','multiple')),
  changed_fields text[] not null,
  previous_data jsonb,
  current_data jsonb not null,
  severity text not null default 'important' check (severity in ('info','important','critical')),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists academic_event_changes_event_idx
  on public.academic_event_changes(academic_event_id,created_at desc);

create table if not exists public.notification_deliveries (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.internal_notifications(id) on delete cascade,
  push_subscription_id uuid references public.push_subscriptions(id) on delete set null,
  status text not null check (status in ('sent','failed','expired','skipped')),
  provider_status integer,
  error_code text,
  created_at timestamptz not null default now()
);
create index if not exists notification_deliveries_notification_idx
  on public.notification_deliveries(notification_id,created_at desc);
create unique index if not exists notification_deliveries_sent_once_idx
  on public.notification_deliveries(notification_id,push_subscription_id) where status = 'sent';

create table if not exists public.moderation_actions (
  id bigint generated always as identity primary key,
  city_id text references public.cities(id) on update cascade on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  target_type text not null,
  target_id text not null,
  action text not null,
  reason text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists moderation_actions_target_idx
  on public.moderation_actions(target_type,target_id,created_at desc);

create or replace function public.refresh_community_event_interest_counts()
returns trigger language plpgsql security definer set search_path = '' as $$
declare affected uuid;
begin
  affected := coalesce(new.event_id, old.event_id);
  update public.community_events e set
    interest_count = (select count(*) from public.community_event_interests i where i.event_id = affected),
    interest_last_24h = (select count(*) from public.community_event_interests i where i.event_id = affected and i.created_at >= now() - interval '24 hours')
  where e.id = affected;
  return coalesce(new,old);
end;
$$;
drop trigger if exists community_event_interest_counts on public.community_event_interests;
create trigger community_event_interest_counts after insert or delete on public.community_event_interests
for each row execute function public.refresh_community_event_interest_counts();

create or replace function public.capture_academic_event_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare fields text[] := '{}';
declare kind text := 'multiple';
declare next_sequence integer;
begin
  if new.title is distinct from old.title then fields := array_append(fields,'title'); end if;
  if new.description is distinct from old.description then fields := array_append(fields,'description'); end if;
  if new.starts_at is distinct from old.starts_at then fields := array_append(fields,'starts_at'); end if;
  if new.ends_at is distinct from old.ends_at then fields := array_append(fields,'ends_at'); end if;
  if new.is_cancelled is distinct from old.is_cancelled then fields := array_append(fields,'is_cancelled'); end if;
  if cardinality(fields) = 0 then return new; end if;
  next_sequence := old.revision_sequence + 1;
  new.revision_sequence := next_sequence;
  new.previous_verified_data := jsonb_build_object('title',old.title,'description',old.description,'starts_at',old.starts_at,'ends_at',old.ends_at,'is_cancelled',old.is_cancelled);
  new.changed_at := now();
  if fields = array['starts_at']::text[] or fields = array['ends_at']::text[] then kind := 'date';
  elsif fields = array['description']::text[] or fields = array['title']::text[] then kind := 'description';
  elsif new.is_cancelled then kind := 'cancelled'; end if;
  -- academic_event_versioned from the production-sources migration already stores
  -- the complete previous row. Keep this table focused on the semantic diff so a
  -- single source update never creates duplicate version-history entries.
  insert into public.academic_event_changes(academic_event_id,source_id,change_type,changed_fields,previous_data,current_data,severity,verified_at)
    values (new.id,new.source_id,kind,fields,to_jsonb(old),to_jsonb(new),'important',coalesce(new.last_verified_at,now()));
  insert into public.internal_notifications(installation_id,target_type,target_id,kind,title,body,destination_url,dedupe_key)
    select i.id,'academic_event',new.id,'academic_change','Změna školního termínu',new.title,
      '/brno/kalendar#' || new.id,'academic-change:' || new.id || ':' || next_sequence
    from public.anonymous_installations i
    where coalesce(new.city_id,'brno') = i.city_id
      and (new.university_id is null or new.university_id = i.university_id)
      and (new.faculty_id is null or new.faculty_id = i.faculty_id)
      and (new.study_years is null or cardinality(new.study_years) = 0 or i.study_year = any(new.study_years))
      and not (new.category::text = any(i.muted_categories))
    on conflict (installation_id,dedupe_key) do nothing;
  return new;
end;
$$;
drop trigger if exists academic_events_capture_change on public.academic_events;
create trigger academic_events_capture_change before update of title,description,starts_at,ends_at,is_cancelled
on public.academic_events for each row execute function public.capture_academic_event_change();

create or replace function public.notify_new_important_academic_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'approved' or new.verification_status <> 'verified' or new.is_demo or new.is_cancelled then return new; end if;
  if new.category::text not in ('course_registration','course_enrollment','seminar_enrollment','enrollment_changes','timetable_release','exam','final_exam_application','final_exam','thesis_deadline','dean_rector_leave') then return new; end if;
  insert into public.internal_notifications(installation_id,target_type,target_id,kind,title,body,destination_url,dedupe_key)
    select i.id,'academic_event',new.id,'new_important_term','Nový důležitý školní termín',new.title,
      '/brno/kalendar#' || new.id,'academic-new:' || new.id
    from public.anonymous_installations i
    where coalesce(new.city_id,'brno') = i.city_id
      and (new.university_id is null or new.university_id = i.university_id)
      and (new.faculty_id is null or new.faculty_id = i.faculty_id)
      and (new.study_years is null or cardinality(new.study_years) = 0 or i.study_year = any(new.study_years))
      and not (new.category::text = any(i.muted_categories))
    on conflict (installation_id,dedupe_key) do nothing;
  return new;
end;
$$;
drop trigger if exists academic_events_notify_new on public.academic_events;
create trigger academic_events_notify_new after insert on public.academic_events
for each row execute function public.notify_new_important_academic_event();

drop trigger if exists saved_items_updated on public.saved_items;
create trigger saved_items_updated before update on public.saved_items
for each row execute function public.set_updated_at();
drop trigger if exists push_subscriptions_updated on public.push_subscriptions;
create trigger push_subscriptions_updated before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.anonymous_installations enable row level security;
alter table public.saved_items enable row level security;
alter table public.internal_notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.calendar_subscriptions enable row level security;
alter table public.community_event_interests enable row level security;
alter table public.place_live_reports enable row level security;
alter table public.academic_event_changes enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.moderation_actions enable row level security;

create policy "staff read installation health" on public.anonymous_installations for select to authenticated using (public.is_admin());
create policy "staff read saved item counts" on public.saved_items for select to authenticated using (public.is_admin());
create policy "staff read notification operations" on public.internal_notifications for select to authenticated using (public.is_admin());
create policy "staff read push health" on public.push_subscriptions for select to authenticated using (public.is_admin());
create policy "staff read calendar subscription health" on public.calendar_subscriptions for select to authenticated using (public.is_admin());
create policy "staff read event interests" on public.community_event_interests for select to authenticated using (public.is_admin());
create policy "city staff manage live reports" on public.place_live_reports for all to authenticated
  using (exists (select 1 from public.places p where p.id=place_id and public.can_manage_city(p.city_id)))
  with check (exists (select 1 from public.places p where p.id=place_id and public.can_manage_city(p.city_id)));
create policy "staff read academic changes" on public.academic_event_changes for select to authenticated
  using (exists (select 1 from public.academic_events e where e.id=academic_event_id and (public.is_super_admin() or public.can_manage_city(coalesce(e.city_id,'brno')) or e.faculty_id=public.editor_faculty_id())));
create policy "staff read notification deliveries" on public.notification_deliveries for select to authenticated using (public.is_admin());
create policy "city staff read moderation actions" on public.moderation_actions for select to authenticated using (public.is_super_admin() or public.can_manage_city(city_id));

revoke all on public.anonymous_installations,public.saved_items,public.internal_notifications,public.push_subscriptions,public.calendar_subscriptions,public.community_event_interests,public.place_live_reports,public.academic_event_changes,public.notification_deliveries,public.moderation_actions from anon,authenticated;
grant select on public.anonymous_installations,public.saved_items,public.internal_notifications,public.push_subscriptions,public.calendar_subscriptions,public.community_event_interests,public.place_live_reports,public.academic_event_changes,public.notification_deliveries,public.moderation_actions to authenticated;
grant all on public.anonymous_installations,public.saved_items,public.internal_notifications,public.push_subscriptions,public.calendar_subscriptions,public.community_event_interests,public.place_live_reports,public.academic_event_changes,public.notification_deliveries,public.moderation_actions to service_role;
grant usage,select on sequence public.community_event_interests_id_seq,public.notification_deliveries_id_seq,public.moderation_actions_id_seq to service_role;
