-- StudentHub Brno: jednotný Supabase Auth, databázově autoritativní role a
-- bezpečná archivace starých tokenových mechanismů. Forward-only migration.

begin;

create table if not exists public.auth_legacy_archive (
  id bigint generated always as identity primary key,
  entity_table text not null,
  entity_id text not null,
  reason text not null check (char_length(reason) between 3 and 300),
  snapshot jsonb not null,
  archived_at timestamptz not null default now(),
  unique (entity_table,entity_id)
);
alter table public.auth_legacy_archive enable row level security;
drop policy if exists "superadmins read legacy auth archive" on public.auth_legacy_archive;
create policy "superadmins read legacy auth archive" on public.auth_legacy_archive
  for select to authenticated using (public.is_super_admin());
revoke all on public.auth_legacy_archive from public,anon,authenticated;
grant select on public.auth_legacy_archive to authenticated;
grant all on public.auth_legacy_archive to service_role;
grant usage,select on sequence public.auth_legacy_archive_id_seq to service_role;

insert into public.auth_legacy_archive(entity_table,entity_id,reason,snapshot)
select 'marketplace_listings',id::text,'legacy_token_or_missing_profile_owner',to_jsonb(m)
from public.marketplace_listings m
where seller_id is null or verification_token_hash is not null or management_token_hash is not null
on conflict (entity_table,entity_id) do nothing;

insert into public.auth_legacy_archive(entity_table,entity_id,reason,snapshot)
select 'community_events',id::text,'legacy_token_or_missing_profile_owner',to_jsonb(e)
from public.community_events e
where management_token_hash is not null or (source_type='community' and author_id is null)
on conflict (entity_table,entity_id) do nothing;

insert into public.auth_legacy_archive(entity_table,entity_id,reason,snapshot)
select 'service_requests',id::text,'legacy_device_owner_token',to_jsonb(s)
from public.service_requests s where owner_token_hash is not null
on conflict (entity_table,entity_id) do nothing;

insert into public.auth_legacy_archive(entity_table,entity_id,reason,snapshot)
select 'buddy_posts',id::text,'missing_profile_owner',to_jsonb(b)
from public.buddy_posts b where owner_id is null
on conflict (entity_table,entity_id) do nothing;

-- Osiřelý veřejný obsah se nemaže: je skryt a zůstává v neveřejném archivu.
update public.marketplace_listings
set status='deleted',deleted_at=coalesce(deleted_at,now()),published_at=null
where seller_id is null or status='pending_verification';
update public.community_events
set status='archived',archived_at=coalesce(archived_at,now())
where source_type='community' and author_id is null;
alter table public.buddy_posts disable trigger buddy_posts_protect_moderation;
update public.buddy_posts
set status='closed',moderation_status='hidden',updated_at=now()
where owner_id is null;
alter table public.buddy_posts enable trigger buddy_posts_protect_moderation;

drop index if exists public.community_events_management_idx;
alter table public.community_events drop constraint if exists community_events_external_provenance_check;
alter table public.community_events drop column if exists management_token_hash;
alter table public.community_events drop column if exists author_email;
alter table public.community_events add constraint community_events_profile_provenance_check check (
  (source_type='community' and author_id is not null)
  or (source_type='community' and author_id is null and status in ('archived','deleted'))
  or
  (source_type='external' and organizer is not null and source_url is not null and source_external_id is not null and last_verified_at is not null)
);

drop index if exists public.marketplace_active_duplicate_idx;
alter table public.marketplace_listings drop column if exists verification_token_hash cascade;
alter table public.marketplace_listings drop column if exists verification_expires_at cascade;
alter table public.marketplace_listings drop column if exists management_token_hash cascade;
alter table public.marketplace_listings drop constraint if exists marketplace_listings_status_check;
alter table public.marketplace_listings add constraint marketplace_listings_status_check
  check (status in ('active','reserved','sold','expired','hidden','deleted','rejected'));
alter table public.marketplace_listings add constraint marketplace_listings_profile_owner_check
  check (seller_id is not null or status in ('deleted','rejected','expired'));
create unique index marketplace_active_duplicate_idx
  on public.marketplace_listings(seller_id,duplicate_fingerprint)
  where seller_id is not null and status in ('active','reserved','hidden');

drop index if exists public.service_requests_owner_idx;
alter table public.service_requests drop column if exists owner_token_hash;
alter table public.buddy_posts drop constraint if exists buddy_posts_profile_owner_check;
alter table public.buddy_posts add constraint buddy_posts_profile_owner_check
  check (owner_id is not null or (status='closed' and moderation_status='hidden'));

-- Profil vzniká vždy s nejnižší rolí bez ohledu na klientská metadata.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name,avatar_url,role,account_status,is_blocked)
  values(
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'),''),nullif(trim(new.raw_user_meta_data ->> 'name'),''),'Student'),100),
    case when coalesce(new.raw_user_meta_data ->> 'avatar_url','') ~ '^https://' then new.raw_user_meta_data ->> 'avatar_url' else null end,
    'user','active',false
  ) on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Přímá klientská aktualizace smí měnit jen veřejná profilová pole, nikdy roli,
-- stav účtu ani redakční rozsah. Aplikační API zapisuje service-role klientem.
revoke update on public.profiles from authenticated;
grant update(username,display_name,bio,university_id,study_program,study_year,interests,avatar_path,avatar_url,profile_visibility,show_faculty,show_study_program,show_study_year,community_rules_accepted_at,allow_chat_requests) on public.profiles to authenticated;

create or replace function public.protect_profile_authorization_fields() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and auth.role()<>'service_role' and (
    new.role is distinct from old.role or new.city_id is distinct from old.city_id
    or new.faculty_id is distinct from old.faculty_id or new.account_status is distinct from old.account_status
    or new.is_blocked is distinct from old.is_blocked
  ) then raise exception 'profile_authorization_fields_are_server_only'; end if;
  return new;
end;
$$;
drop trigger if exists profiles_protect_authorization_fields on public.profiles;
create trigger profiles_protect_authorization_fields before update on public.profiles
for each row execute function public.protect_profile_authorization_fields();

drop index if exists public.profiles_single_super_admin_idx;
alter table public.profiles drop constraint if exists profiles_admin_scope_required;
alter table public.profiles add constraint profiles_admin_scope_required check (
  (role not in ('admin','city_editor') or (city_id is not null and faculty_id is null))
  and (role<>'faculty_editor' or faculty_id is not null)
);

create or replace function public.protect_last_active_super_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
declare losing_access boolean;
begin
  if tg_op='DELETE' then
    losing_access := old.role='super_admin' and old.account_status='active' and not old.is_blocked;
  else
    losing_access := old.role='super_admin' and old.account_status='active' and not old.is_blocked and (
      new.role<>'super_admin' or new.account_status<>'active' or new.is_blocked
    );
  end if;
  if losing_access and not exists(
    select 1 from public.profiles p where p.id<>old.id and p.role='super_admin' and p.account_status='active' and not p.is_blocked
  ) then raise exception 'last_active_superadmin'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists profiles_protect_primary_super_admin on public.profiles;
drop trigger if exists profiles_protect_last_active_super_admin_update on public.profiles;
drop trigger if exists profiles_protect_last_active_super_admin_delete on public.profiles;
create trigger profiles_protect_last_active_super_admin_update before update of role,account_status,is_blocked on public.profiles
for each row execute function public.protect_last_active_super_admin();
create trigger profiles_protect_last_active_super_admin_delete before delete on public.profiles
for each row execute function public.protect_last_active_super_admin();

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=auth.uid() and p.role='super_admin' and p.account_status='active' and not p.is_blocked and u.email_confirmed_at is not null);
$$;
create or replace function public.admin_city_id() returns text
language sql stable security definer set search_path = '' as $$
  select p.city_id from public.profiles p join auth.users u on u.id=p.id
  where p.id=auth.uid() and p.role in ('city_editor','admin') and p.account_status='active' and not p.is_blocked and u.email_confirmed_at is not null limit 1;
$$;
create or replace function public.editor_faculty_id() returns text
language sql stable security definer set search_path = '' as $$
  select p.faculty_id from public.profiles p join auth.users u on u.id=p.id
  where p.id=auth.uid() and p.role='faculty_editor' and p.account_status='active' and not p.is_blocked and u.email_confirmed_at is not null limit 1;
$$;
create or replace function public.is_content_editor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=auth.uid() and p.role in ('faculty_editor','city_editor','admin','super_admin') and p.account_status='active' and not p.is_blocked and u.email_confirmed_at is not null);
$$;
create or replace function public.can_manage_city(target_city text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or exists(select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=auth.uid() and p.role in ('city_editor','admin') and p.city_id=target_city and p.account_status='active' and not p.is_blocked and u.email_confirmed_at is not null);
$$;
create or replace function public.can_manage_sensitive_city(target_city text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or exists(select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=auth.uid() and p.role='admin' and p.city_id=target_city and p.account_status='active' and not p.is_blocked and u.email_confirmed_at is not null);
$$;

create or replace function public.set_profile_admin_role(
  p_actor_id uuid,p_target_id uuid,p_role text,p_city_id text,p_faculty_id text,p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_profile public.profiles%rowtype; target_profile public.profiles%rowtype; next_city text; next_faculty text;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  if p_role not in ('user','faculty_editor','city_editor','admin','super_admin') then raise exception 'invalid_role_scope'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'reason_required'; end if;
  select * into actor_profile from public.profiles where id=p_actor_id for update;
  if actor_profile.id is null or actor_profile.role<>'super_admin' or actor_profile.account_status<>'active' or actor_profile.is_blocked then raise exception 'superadmin_required'; end if;
  select * into target_profile from public.profiles where id=p_target_id for update;
  if target_profile.id is null or not exists(select 1 from auth.users u where u.id=p_target_id and u.email_confirmed_at is not null) then raise exception 'confirmed_account_required'; end if;
  if p_role in ('admin','city_editor') then
    if p_city_id is null or p_faculty_id is not null or not exists(select 1 from public.cities c where c.id=p_city_id) then raise exception 'invalid_role_scope'; end if;
    next_city:=p_city_id; next_faculty:=null;
  elsif p_role='faculty_editor' then
    if p_faculty_id is null or p_city_id is not null or not exists(select 1 from public.faculties f where f.id=p_faculty_id and f.is_active) then raise exception 'invalid_role_scope'; end if;
    next_city:=null; next_faculty:=p_faculty_id;
  else
    next_city:=null; next_faculty:=null;
  end if;
  if target_profile.role='super_admin' and target_profile.account_status='active' and not target_profile.is_blocked and p_role<>'super_admin'
    and not exists(select 1 from public.profiles p where p.id<>p_target_id and p.role='super_admin' and p.account_status='active' and not p.is_blocked)
  then raise exception 'last_active_superadmin'; end if;
  update public.profiles set role=p_role,city_id=next_city,faculty_id=next_faculty,updated_at=now() where id=p_target_id;
  insert into public.admin_role_audit(actor_id,target_id,previous_role,new_role,previous_city_id,new_city_id,previous_faculty_id,new_faculty_id,reason)
  values(p_actor_id,p_target_id,target_profile.role,p_role,target_profile.city_id,next_city,target_profile.faculty_id,next_faculty,trim(p_reason));
  delete from auth.sessions where user_id=p_target_id;
  return jsonb_build_object('role',p_role,'city_id',next_city,'faculty_id',next_faculty);
end;
$$;
revoke all on function public.set_profile_admin_role(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.set_profile_admin_role(uuid,uuid,text,text,text,text) to service_role;

create or replace function public.bootstrap_first_super_admin(p_target_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_profile public.profiles%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'reason_required'; end if;
  lock table public.profiles in share row exclusive mode;
  select * into target_profile from public.profiles where id=p_target_id for update;
  if target_profile.id is null or target_profile.account_status<>'active' or target_profile.is_blocked
    or not exists(select 1 from auth.users u where u.id=p_target_id and u.email_confirmed_at is not null)
  then raise exception 'confirmed_active_account_required'; end if;
  if target_profile.role='super_admin' then return jsonb_build_object('changed',false,'role','super_admin'); end if;
  if exists(select 1 from public.profiles p where p.role='super_admin' and p.account_status='active' and not p.is_blocked)
  then raise exception 'active_superadmin_already_exists'; end if;
  update public.profiles set role='super_admin',city_id=null,faculty_id=null,updated_at=now() where id=p_target_id;
  insert into public.admin_role_audit(actor_id,target_id,previous_role,new_role,previous_city_id,new_city_id,previous_faculty_id,new_faculty_id,reason)
  values(p_target_id,p_target_id,target_profile.role,'super_admin',target_profile.city_id,null,target_profile.faculty_id,null,trim(p_reason));
  delete from auth.sessions where user_id=p_target_id;
  return jsonb_build_object('changed',true,'role','super_admin');
end;
$$;
revoke all on function public.bootstrap_first_super_admin(uuid,text) from public,anon,authenticated;
grant execute on function public.bootstrap_first_super_admin(uuid,text) to service_role;

-- Aktualizovaná ochrana komunitních akcí už nepoužívá legacy management token.
create or replace function public.enforce_community_event_publication() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' and new.source_type='community' then
    if new.author_id is null or not public.is_profile_ready(new.author_id) then raise exception 'confirmed_profile_owner_required'; end if;
    new.status:=case when public.is_trusted_event_publisher(new.author_id) then 'published' else 'pending' end;
  end if;
  if tg_op='UPDATE' then
    if new.city_id is distinct from old.city_id or new.source_type is distinct from old.source_type
      or (new.author_id is distinct from old.author_id and not (old.author_id is not null and new.author_id is null and new.status='deleted')) then
      raise exception 'community event owner and provenance are immutable';
    end if;
    if auth.uid()=old.author_id then
      if not public.is_active_profile(old.author_id) then raise exception 'profile is not active'; end if;
      if new.status not in (old.status,'deleted') then raise exception 'event author cannot change moderation status'; end if;
      if not public.is_trusted_event_publisher(old.author_id) and old.status='published' and (
        new.title is distinct from old.title or new.category is distinct from old.category or new.starts_at is distinct from old.starts_at
        or new.ends_at is distinct from old.ends_at or new.venue is distinct from old.venue or new.description is distinct from old.description
        or new.is_free is distinct from old.is_free or new.price_amount is distinct from old.price_amount or new.event_url is distinct from old.event_url
      ) then new.status:='pending'; end if;
    end if;
  end if;
  return new;
end;
$$;

commit;
