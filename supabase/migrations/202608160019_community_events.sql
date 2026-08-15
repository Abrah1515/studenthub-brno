-- StudentHub Brno: veřejné komunitní akce s anonymní správou autora a automatickou moderací.

create table if not exists public.community_events (
  id uuid primary key default gen_random_uuid(),
  city_id text not null references public.cities(id) on update cascade on delete restrict,
  title text not null check (char_length(title) between 4 and 140),
  category text not null check (category in ('Kultura','Sport','Studium','Zábava','Ostatní')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue text not null check (char_length(venue) between 2 and 160),
  description text not null check (char_length(description) between 20 and 2000),
  is_free boolean not null default true,
  price_amount numeric(10,2) check (price_amount is null or price_amount between 0 and 100000),
  currency text not null default 'CZK' check (currency = 'CZK'),
  event_url text check (event_url is null or event_url ~ '^https://'),
  image_url text check (image_url is null or image_url ~ '^https://'),
  author_email text not null check (char_length(author_email) between 5 and 254),
  management_token_hash text not null unique check (management_token_hash ~ '^[a-f0-9]{64}$'),
  duplicate_fingerprint text not null check (duplicate_fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null default 'published' check (status in ('published','hidden','archived','deleted')),
  report_count integer not null default 0 check (report_count >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or (ends_at >= starts_at and ends_at <= starts_at + interval '7 days')),
  check ((is_free and coalesce(price_amount,0) = 0) or (not is_free and price_amount is not null))
);

create unique index if not exists community_events_active_duplicate_idx
  on public.community_events(city_id,duplicate_fingerprint)
  where status in ('published','hidden');
create index if not exists community_events_public_idx
  on public.community_events(city_id,starts_at,category)
  where status = 'published';
create index if not exists community_events_management_idx
  on public.community_events(management_token_hash);

drop trigger if exists community_events_updated on public.community_events;
create trigger community_events_updated before update on public.community_events
  for each row execute function public.set_updated_at();

alter table public.community_events enable row level security;
create policy "city staff manage community events" on public.community_events for all to authenticated
  using (public.can_manage_city(city_id)) with check (public.can_manage_city(city_id));
revoke all on public.community_events from anon,authenticated;
grant select,insert,update,delete on public.community_events to service_role;
grant select,update on public.community_events to authenticated;

alter table public.content_reports drop constraint if exists content_reports_target_type_check;
alter table public.content_reports add constraint content_reports_target_type_check
  check (target_type in ('service_request','buddy_post','community_event'));

create or replace function public.hide_reported_community_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare report_total integer;
begin
  if new.target_type <> 'community_event' then return new; end if;
  select count(*)::integer into report_total
  from public.content_reports
  where target_type = 'community_event' and target_id = new.target_id and status in ('new','reviewed');
  update public.community_events
  set report_count = report_total,
      status = case when report_total >= 3 and status = 'published' then 'hidden' else status end
  where id = new.target_id;
  return new;
end;
$$;
drop trigger if exists content_reports_hide_community_event on public.content_reports;
create trigger content_reports_hide_community_event after insert on public.content_reports
  for each row execute function public.hide_reported_community_event();

create or replace function public.archive_expired_community_events() returns integer
language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  update public.community_events
  set status = 'archived', archived_at = now()
  where status = 'published' and coalesce(ends_at,starts_at) < now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.archive_expired_community_events() from public,anon,authenticated;
grant execute on function public.archive_expired_community_events() to service_role;
