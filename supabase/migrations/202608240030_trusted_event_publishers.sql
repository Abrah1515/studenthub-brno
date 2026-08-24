-- StudentHub Brno: oddělené oprávnění důvěryhodných vydavatelů komunitních akcí.
-- Oprávnění není administrátorská role a staré návrhy ani existující akce se nemění.

create table if not exists public.profile_permissions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null check (permission = 'trusted_event_publisher'),
  status text not null check (status in ('active','suspended','revoked')),
  internal_reason text not null check (char_length(trim(internal_reason)) between 3 and 800),
  granted_by uuid not null references public.profiles(id) on delete restrict,
  granted_at timestamptz not null default now(),
  suspended_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (profile_id,permission),
  check (
    (status = 'active' and suspended_at is null and revoked_at is null)
    or (status = 'suspended' and suspended_at is not null and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);

create table if not exists public.profile_permission_audit (
  id bigint generated always as identity primary key,
  permission_id uuid references public.profile_permissions(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('granted','suspended','reactivated','revoked')),
  previous_status text check (previous_status is null or previous_status in ('active','suspended','revoked')),
  new_status text not null check (new_status in ('active','suspended','revoked')),
  reason text not null check (char_length(trim(reason)) between 3 and 800),
  created_at timestamptz not null default now()
);

create index if not exists profile_permissions_status_idx
  on public.profile_permissions(permission,status,updated_at desc);
create index if not exists profile_permission_audit_profile_idx
  on public.profile_permission_audit(profile_id,created_at desc);
create index if not exists profile_permission_audit_actor_idx
  on public.profile_permission_audit(actor_id,created_at desc);

drop trigger if exists profile_permissions_updated on public.profile_permissions;
create trigger profile_permissions_updated before update on public.profile_permissions
  for each row execute function public.set_updated_at();

alter table public.profile_permissions enable row level security;
alter table public.profile_permission_audit enable row level security;

create policy "superadmins read profile permissions" on public.profile_permissions
  for select to authenticated using (public.is_super_admin());
create policy "superadmins read profile permission audit" on public.profile_permission_audit
  for select to authenticated using (public.is_super_admin());

revoke all on public.profile_permissions,public.profile_permission_audit from anon,authenticated;
grant select on public.profile_permissions,public.profile_permission_audit to authenticated;
grant all on public.profile_permissions,public.profile_permission_audit to service_role;
grant usage,select on sequence public.profile_permission_audit_id_seq to service_role;

create or replace function public.is_trusted_event_publisher(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_profile_ready(target) and exists (
    select 1
    from public.profile_permissions pp
    join public.profiles p on p.id=pp.profile_id
    where pp.profile_id=target
      and pp.permission='trusted_event_publisher'
      and pp.status='active'
      and p.role='user'
  );
$$;
revoke all on function public.is_trusted_event_publisher(uuid) from public,anon,authenticated;
grant execute on function public.is_trusted_event_publisher(uuid) to service_role;

create or replace function public.manage_trusted_event_publisher(
  target_profile_id uuid,
  requested_action text,
  internal_reason text,
  actor_profile_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  current_permission public.profile_permissions%rowtype;
  previous_status text;
  resulting_status text;
  resulting_action text;
begin
  if requested_action not in ('grant','suspend','reactivate','revoke') then
    raise exception 'unsupported permission action';
  end if;
  if char_length(trim(coalesce(internal_reason,''))) not between 3 and 800 then
    raise exception 'permission reason is required';
  end if;
  if target_profile_id=actor_profile_id then
    raise exception 'superadmin cannot grant this permission to self';
  end if;
  if not exists (
    select 1 from public.profiles p
    join auth.users u on u.id=p.id
    where p.id=actor_profile_id and p.role='super_admin' and p.account_status='active'
      and not p.is_blocked and u.email_confirmed_at is not null
  ) then
    raise exception 'actor is not an active superadmin';
  end if;
  if not exists (select 1 from public.profiles p where p.id=target_profile_id and p.role='user') then
    raise exception 'target must be a regular user profile';
  end if;

  select * into current_permission
  from public.profile_permissions
  where profile_id=target_profile_id and permission='trusted_event_publisher'
  for update;
  previous_status := current_permission.status;

  if requested_action='grant' then
    if not public.is_profile_ready(target_profile_id) then
      raise exception 'target profile is not eligible';
    end if;
    if current_permission.id is not null and current_permission.status <> 'revoked' then
      raise exception 'permission is already assigned';
    end if;
    if current_permission.id is null then
      insert into public.profile_permissions(profile_id,permission,status,internal_reason,granted_by)
      values(target_profile_id,'trusted_event_publisher','active',trim(internal_reason),actor_profile_id)
      returning * into current_permission;
    else
      update public.profile_permissions set status='active',internal_reason=trim(internal_reason),granted_by=actor_profile_id,
        granted_at=now(),suspended_at=null,revoked_at=null
      where id=current_permission.id returning * into current_permission;
    end if;
    resulting_status := 'active'; resulting_action := 'granted';
  elsif requested_action='suspend' then
    if current_permission.id is null or current_permission.status <> 'active' then raise exception 'only active permission can be suspended'; end if;
    update public.profile_permissions set status='suspended',suspended_at=now(),revoked_at=null
      where id=current_permission.id returning * into current_permission;
    resulting_status := 'suspended'; resulting_action := 'suspended';
  elsif requested_action='reactivate' then
    if current_permission.id is null or current_permission.status <> 'suspended' then raise exception 'only suspended permission can be reactivated'; end if;
    if not public.is_profile_ready(target_profile_id) then raise exception 'target profile is not eligible'; end if;
    update public.profile_permissions set status='active',suspended_at=null,revoked_at=null
      where id=current_permission.id returning * into current_permission;
    resulting_status := 'active'; resulting_action := 'reactivated';
  else
    if current_permission.id is null or current_permission.status='revoked' then raise exception 'permission is not assigned'; end if;
    update public.profile_permissions set status='revoked',revoked_at=now()
      where id=current_permission.id returning * into current_permission;
    resulting_status := 'revoked'; resulting_action := 'revoked';
  end if;

  insert into public.profile_permission_audit(permission_id,profile_id,actor_id,action,previous_status,new_status,reason)
  values(current_permission.id,target_profile_id,actor_profile_id,resulting_action,previous_status,resulting_status,trim(internal_reason));
  return current_permission.id;
end;
$$;
revoke all on function public.manage_trusted_event_publisher(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.manage_trusted_event_publisher(uuid,text,text,uuid) to service_role;

alter table public.community_events drop constraint if exists community_events_status_check;
alter table public.community_events add constraint community_events_status_check
  check (status in ('pending','published','hidden','archived','deleted'));

drop index if exists public.community_events_active_duplicate_idx;
create unique index community_events_active_duplicate_idx
  on public.community_events(city_id,duplicate_fingerprint)
  where status in ('pending','published','hidden');

create or replace function public.enforce_community_event_publication() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' and new.source_type='community' and new.author_id is not null then
    new.status := case when public.is_trusted_event_publisher(new.author_id) then 'published' else 'pending' end;
  end if;
  if tg_op='UPDATE' then
    if new.city_id is distinct from old.city_id
      or new.source_type is distinct from old.source_type
      or new.management_token_hash is distinct from old.management_token_hash then
      raise exception 'community event scope and provenance are immutable';
    end if;
    if auth.uid()=old.author_id then
      if not public.is_active_profile(old.author_id) then raise exception 'profile is not active'; end if;
      if new.status not in (old.status,'deleted') then raise exception 'event author cannot change moderation status'; end if;
      if not public.is_trusted_event_publisher(old.author_id) and old.status='published' and (
        new.title is distinct from old.title or new.category is distinct from old.category
        or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
        or new.venue is distinct from old.venue or new.description is distinct from old.description
        or new.is_free is distinct from old.is_free or new.price_amount is distinct from old.price_amount
        or new.event_url is distinct from old.event_url
      ) then new.status := 'pending'; end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_community_event_publication on public.community_events;
create trigger enforce_community_event_publication before insert or update on public.community_events
  for each row execute function public.enforce_community_event_publication();

drop policy if exists "event authors read own events" on public.community_events;
create policy "event authors read own events" on public.community_events for select to authenticated
  using (author_id=auth.uid());
drop policy if exists "event authors update own events" on public.community_events;
create policy "event authors update own events" on public.community_events for update to authenticated
  using (author_id=auth.uid() and public.is_active_profile())
  with check (author_id=auth.uid() and source_type='community' and public.is_active_profile());

revoke update on public.community_events from authenticated;
grant update (title,category,starts_at,ends_at,venue,description,is_free,price_amount,event_url,status)
  on public.community_events to authenticated;
