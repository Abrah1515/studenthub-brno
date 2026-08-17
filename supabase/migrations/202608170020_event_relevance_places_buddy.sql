-- Relevance is calculated in Europe/Prague by the application. This migration
-- adds durable place identities and post-report moderation without deleting history.

alter table public.places
  add column if not exists source_external_id text,
  add column if not exists dedupe_key text;

create or replace function public.normalized_place_key(
  source_external_id_value text,
  osm_type_value text,
  osm_id_value bigint,
  name_value text,
  address_value text
) returns text
language sql immutable set search_path = '' as $$
  select case
    when nullif(trim(source_external_id_value), '') is not null
      then 'source:' || lower(trim(source_external_id_value))
    when osm_id_value is not null
      then 'osm:' || coalesce(osm_type_value, 'object') || ':' || osm_id_value::text
    else 'content:' || md5(
      regexp_replace(lower(trim(coalesce(name_value, ''))), '[^[:alnum:]]+', ' ', 'g')
      || '|' ||
      regexp_replace(lower(trim(coalesce(address_value, ''))), '[^[:alnum:]]+', ' ', 'g')
    )
  end;
$$;

create or replace function public.set_place_dedupe_key() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.dedupe_key := public.normalized_place_key(new.source_external_id, new.osm_type, new.osm_id, new.name, new.address);
  return new;
end;
$$;

update public.places
set source_external_id = coalesce(source_external_id, case when osm_id is not null then coalesce(osm_type, 'object') || ':' || osm_id::text end),
    dedupe_key = public.normalized_place_key(coalesce(source_external_id, case when osm_id is not null then coalesce(osm_type, 'object') || ':' || osm_id::text end), osm_type, osm_id, name, address);

with ranked as (
  select id,
    row_number() over (
      partition by city_id, dedupe_key
      order by (verification_status = 'verified') desc, last_verified_at desc nulls last, updated_at desc, id
    ) as duplicate_rank
  from public.places
  where status = 'approved' and is_demo = false and dedupe_key is not null
)
update public.places p
set status = 'archived', updated_at = now()
from ranked r
where p.id = r.id and r.duplicate_rank > 1;

alter table public.places alter column dedupe_key set not null;
drop trigger if exists places_set_dedupe_key on public.places;
create trigger places_set_dedupe_key before insert or update of source_external_id,osm_type,osm_id,name,address
on public.places for each row execute function public.set_place_dedupe_key();

create unique index if not exists places_public_dedupe_unique
  on public.places(city_id,dedupe_key)
  where status = 'approved' and is_demo = false;

alter table public.buddy_posts
  add column if not exists report_count integer not null default 0 check (report_count >= 0);

create or replace function public.protect_buddy_moderation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.moderation_status is distinct from old.moderation_status
    and pg_trigger_depth() <= 1
    and current_user <> 'service_role'
    and not public.can_manage_city(old.city_id) then
    raise exception 'moderation_status can be changed only by authorized staff';
  end if;
  return new;
end;
$$;

create or replace function public.hide_reported_buddy_post() returns trigger
language plpgsql security definer set search_path = '' as $$
declare report_total integer;
begin
  if new.target_type <> 'buddy_post' then return new; end if;
  select count(*)::integer into report_total
  from public.content_reports
  where target_type = 'buddy_post' and target_id = new.target_id and status in ('new','reviewed');
  update public.buddy_posts
  set report_count = report_total,
      moderation_status = case when report_total >= 3 then 'hidden' else moderation_status end
  where id = new.target_id;
  return new;
end;
$$;

drop trigger if exists content_reports_hide_buddy_post on public.content_reports;
create trigger content_reports_hide_buddy_post after insert on public.content_reports
  for each row execute function public.hide_reported_buddy_post();
