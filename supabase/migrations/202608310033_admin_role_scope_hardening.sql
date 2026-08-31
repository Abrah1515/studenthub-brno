-- Role and city-scope hardening for production administration.
-- Forward-only: existing rows are preserved and Brno is used only as the
-- deterministic city for legacy chats that predate the city column.

create table if not exists public.admin_role_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  target_id uuid not null references public.profiles(id) on delete cascade,
  previous_role text not null,
  new_role text not null,
  previous_city_id text references public.cities(id) on update cascade on delete set null,
  new_city_id text references public.cities(id) on update cascade on delete set null,
  previous_faculty_id text references public.faculties(id) on update cascade on delete set null,
  new_faculty_id text references public.faculties(id) on update cascade on delete set null,
  reason text not null default 'Změna v administraci' check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);
create index if not exists admin_role_audit_target_idx on public.admin_role_audit(target_id,created_at desc);
alter table public.admin_role_audit enable row level security;
drop policy if exists "superadmins read role audit" on public.admin_role_audit;
create policy "superadmins read role audit" on public.admin_role_audit for select to authenticated using (public.is_super_admin());
revoke all on public.admin_role_audit from anon,authenticated;
grant select on public.admin_role_audit to authenticated;
grant all on public.admin_role_audit to service_role;
grant usage,select on sequence public.admin_role_audit_id_seq to service_role;

create unique index if not exists profiles_single_super_admin_idx on public.profiles ((role)) where role='super_admin';
alter table public.profiles drop constraint if exists profiles_admin_scope_required;
alter table public.profiles add constraint profiles_admin_scope_required check (
  (role not in ('admin','city_editor') or city_id is not null)
  and (role<>'faculty_editor' or faculty_id is not null)
) not valid;
create or replace function public.protect_primary_super_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and old.role='super_admin' and new.role<>'super_admin'
    and not exists(select 1 from public.profiles p where p.role='super_admin' and p.id<>old.id) then
    raise exception 'cannot_demote_only_superadmin';
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_primary_super_admin on public.profiles;
create trigger profiles_protect_primary_super_admin before update of role on public.profiles for each row execute function public.protect_primary_super_admin();

create or replace function public.can_manage_sensitive_city(target_city text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='admin' and p.city_id=target_city
  );
$$;

drop policy if exists "city staff read requests" on public.service_requests;
drop policy if exists "city staff update requests" on public.service_requests;
create policy "city admins read requests" on public.service_requests for select to authenticated using (public.can_manage_sensitive_city(city_id));
create policy "city admins update requests" on public.service_requests for update to authenticated using (public.can_manage_sensitive_city(city_id)) with check (public.can_manage_sensitive_city(city_id));

drop policy if exists "city staff read contact messages" on public.contact_messages;
drop policy if exists "city staff update contact messages" on public.contact_messages;
create policy "city admins read contact messages" on public.contact_messages for select to authenticated using (public.can_manage_sensitive_city(city_id));
create policy "city admins update contact messages" on public.contact_messages for update to authenticated using (public.can_manage_sensitive_city(city_id)) with check (public.can_manage_sensitive_city(city_id));

drop policy if exists "city staff read clicks" on public.outbound_clicks;
drop policy if exists "city staff read page views" on public.page_views;
create policy "city admins read clicks" on public.outbound_clicks for select to authenticated using (city_id is not null and public.can_manage_sensitive_city(city_id));
create policy "city admins read page views" on public.page_views for select to authenticated using (city_id is not null and public.can_manage_sensitive_city(city_id));

alter table public.chat_conversations add column if not exists city_id text references public.cities(id) on update cascade on delete restrict;
update public.chat_conversations c set city_id=coalesce(
  case when c.context_type='buddy_post' then (select p.city_id from public.buddy_posts p where p.id=c.context_id) end,
  case when c.context_type='marketplace_listing' then (select m.city_id from public.marketplace_listings m where m.id=c.context_id) end,
  (select p.city_id from public.profiles p where p.id=c.initiator_id),
  (select p.city_id from public.profiles p where p.id=c.recipient_id),
  'brno'
) where c.city_id is null;
alter table public.chat_conversations alter column city_id set not null;
create index if not exists chat_conversations_city_status_idx on public.chat_conversations(city_id,status,last_message_at desc);

create or replace function public.assign_chat_city()
returns trigger language plpgsql security definer set search_path = '' as $$
declare resolved_city text;
begin
  if new.context_type='buddy_post' then select city_id into resolved_city from public.buddy_posts where id=new.context_id;
  elsif new.context_type='marketplace_listing' then select city_id into resolved_city from public.marketplace_listings where id=new.context_id;
  elsif new.context_type='profile' then select city_id into resolved_city from public.profiles where id=new.initiator_id;
  end if;
  resolved_city:=coalesce(resolved_city,(select city_id from public.profiles where id=new.recipient_id));
  if resolved_city is null then raise exception 'chat_city_unavailable'; end if;
  if new.city_id is not null and new.city_id<>resolved_city then raise exception 'chat_city_mismatch'; end if;
  new.city_id:=resolved_city;
  return new;
end $$;
drop trigger if exists chat_conversations_assign_city on public.chat_conversations;
create trigger chat_conversations_assign_city before insert or update of context_type,context_id,initiator_id,recipient_id,city_id on public.chat_conversations for each row execute function public.assign_chat_city();

create or replace function public.chat_reported_message(target_message uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.chat_message_reports r
    join public.chat_messages m on m.id=r.message_id
    join public.chat_conversations c on c.id=m.conversation_id
    where r.message_id=target_message
      and (public.is_super_admin() or public.can_manage_city(c.city_id))
  );
$$;

drop policy if exists "reporters and moderators read chat reports" on public.chat_message_reports;
create policy "reporters and scoped moderators read chat reports" on public.chat_message_reports for select to authenticated using (
  reporter_id=auth.uid() or exists(
    select 1 from public.chat_messages m join public.chat_conversations c on c.id=m.conversation_id
    where m.id=message_id and (public.is_super_admin() or public.can_manage_city(c.city_id))
  )
);
drop policy if exists "moderators read chat action audit" on public.chat_moderation_actions;
create policy "scoped moderators read chat action audit" on public.chat_moderation_actions for select to authenticated using (
  public.is_super_admin() or exists(select 1 from public.chat_conversations c where c.id=conversation_id and public.can_manage_city(c.city_id))
);

comment on table public.admin_role_audit is 'Neveřejný audit změn administrátorských rolí a rozsahů.';
comment on column public.chat_conversations.city_id is 'Neměnný městský rozsah konverzace odvozený serverem z kontextu nebo profilu.';
