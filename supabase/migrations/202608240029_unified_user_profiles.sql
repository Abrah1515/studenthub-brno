-- StudentHub Brno: dobrovolné účty, veřejné profily a jednotné vlastnictví komunitního obsahu.
-- Starší obsah se nemaže ani automaticky nepřiřazuje; nullable author vazby jej zachovají anonymní.

alter table public.profiles
  add column if not exists username text,
  add column if not exists bio text,
  add column if not exists study_program text,
  add column if not exists study_year smallint,
  add column if not exists interests text[] not null default '{}',
  add column if not exists avatar_path text,
  add column if not exists avatar_url text,
  add column if not exists profile_visibility text not null default 'private',
  add column if not exists show_faculty boolean not null default true,
  add column if not exists show_study_program boolean not null default true,
  add column if not exists show_study_year boolean not null default true,
  add column if not exists community_rules_accepted_at timestamptz,
  add column if not exists account_status text not null default 'active',
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text,
  add column if not exists deleted_at timestamptz;

alter table public.profiles drop constraint if exists profiles_username_check;
alter table public.profiles add constraint profiles_username_check check (
  username is null or (
    username ~ '^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])?$'
    and username not in ('admin','administrator','studenthub','studenthubbrno','moderator','support','podpora','root','system','api','profil','profily','ucet')
  )
);
alter table public.profiles drop constraint if exists profiles_bio_check;
alter table public.profiles add constraint profiles_bio_check check (bio is null or char_length(bio) <= 500);
alter table public.profiles drop constraint if exists profiles_study_program_check;
alter table public.profiles add constraint profiles_study_program_check check (study_program is null or char_length(study_program) <= 140);
alter table public.profiles drop constraint if exists profiles_study_year_check;
alter table public.profiles add constraint profiles_study_year_check check (study_year is null or study_year between 1 and 6);
alter table public.profiles drop constraint if exists profiles_interests_check;
alter table public.profiles add constraint profiles_interests_check check (cardinality(interests) <= 12);
alter table public.profiles drop constraint if exists profiles_avatar_path_check;
alter table public.profiles add constraint profiles_avatar_path_check check (avatar_path is null or avatar_path ~ '^[a-f0-9-]{36}/avatar\.webp$');
alter table public.profiles drop constraint if exists profiles_avatar_url_check;
alter table public.profiles add constraint profiles_avatar_url_check check (avatar_url is null or avatar_url ~ '^https://');
alter table public.profiles drop constraint if exists profiles_visibility_check;
alter table public.profiles add constraint profiles_visibility_check check (profile_visibility in ('public','private'));
alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check check (account_status in ('active','suspended','deleted'));
alter table public.profiles drop constraint if exists profiles_suspension_reason_check;
alter table public.profiles add constraint profiles_suspension_reason_check check (suspension_reason is null or char_length(suspension_reason) <= 800);
create unique index if not exists profiles_username_unique_idx on public.profiles(lower(username)) where username is not null;
create index if not exists profiles_public_directory_idx on public.profiles(created_at desc) where profile_visibility = 'public' and account_status = 'active' and username is not null;

update public.profiles set account_status = 'suspended', suspended_at = coalesce(suspended_at,now()) where is_blocked and account_status = 'active';

alter table public.marketplace_listings add column if not exists seller_id uuid references public.profiles(id) on delete set null;
alter table public.marketplace_messages add column if not exists buyer_id uuid references public.profiles(id) on delete set null;
alter table public.community_events add column if not exists author_id uuid references public.profiles(id) on delete set null;
create index if not exists marketplace_listings_seller_idx on public.marketplace_listings(seller_id,created_at desc);
create index if not exists marketplace_messages_buyer_idx on public.marketplace_messages(buyer_id,created_at desc);
create index if not exists community_events_author_idx on public.community_events(author_id,created_at desc);

alter table public.buddy_posts drop constraint if exists buddy_posts_owner_id_fkey;
alter table public.buddy_posts alter column owner_id drop not null;
alter table public.buddy_posts add constraint buddy_posts_owner_id_fkey foreign key (owner_id) references public.profiles(id) on delete set null;

create table if not exists public.profile_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id,blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.profile_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','hate','privacy','fraud','impersonation','other')),
  detail text not null default '' check (char_length(detail) <= 800),
  status text not null default 'new' check (status in ('new','reviewed','dismissed','actioned')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (reporter_id,reported_id),
  check (reporter_id <> reported_id)
);

create table if not exists public.account_moderation_history (
  id bigint generated always as identity primary key,
  profile_id uuid references public.profiles(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('suspended','restored','profile_hidden','profile_restored','account_deleted','report_dismissed')),
  reason text not null default '' check (char_length(reason) <= 800),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists profile_reports_queue_idx on public.profile_reports(status,created_at desc);
create index if not exists account_moderation_profile_idx on public.account_moderation_history(profile_id,created_at desc);

create or replace function public.is_active_profile(target uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=target and p.account_status='active' and not p.is_blocked and u.email_confirmed_at is not null
  );
$$;

create or replace function public.is_profile_ready(target uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=target and p.account_status='active' and not p.is_blocked and u.email_confirmed_at is not null
      and p.username is not null and p.display_name is not null and char_length(trim(p.display_name)) >= 2
      and p.community_rules_accepted_at is not null
  );
$$;
revoke all on function public.is_active_profile(uuid),public.is_profile_ready(uuid) from public,anon;
grant execute on function public.is_active_profile(uuid),public.is_profile_ready(uuid) to authenticated,service_role;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id,display_name,avatar_url)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'),''),nullif(trim(new.raw_user_meta_data ->> 'name'),''),'Student'),100),
    case when coalesce(new.raw_user_meta_data ->> 'avatar_url','') ~ '^https://' then new.raw_user_meta_data ->> 'avatar_url' else null end
  ) on conflict (id) do nothing;
  return new;
end;
$$;

alter table public.profile_blocks enable row level security;
alter table public.profile_reports enable row level security;
alter table public.account_moderation_history enable row level security;

drop policy if exists "profiles own or superadmin read" on public.profiles;
drop policy if exists "profiles own read" on public.profiles;
create policy "profiles owner staff or public read" on public.profiles for select to authenticated
  using (id=auth.uid() or public.is_super_admin() or (profile_visibility='public' and account_status='active' and username is not null));
create policy "public profiles are readable" on public.profiles for select to anon
  using (profile_visibility='public' and account_status='active' and username is not null);
drop policy if exists "profiles own update" on public.profiles;
create policy "profiles owner update" on public.profiles for update to authenticated
  using (id=auth.uid() and account_status='active')
  with check (id=auth.uid() and account_status='active');

create policy "users manage own blocks" on public.profile_blocks for all to authenticated
  using (blocker_id=auth.uid()) with check (blocker_id=auth.uid() and public.is_active_profile());
create policy "users create profile reports" on public.profile_reports for insert to authenticated
  with check (reporter_id=auth.uid() and public.is_active_profile());
create policy "superadmins manage profile reports" on public.profile_reports for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "superadmins read account moderation" on public.account_moderation_history for select to authenticated
  using (public.is_super_admin());

drop policy if exists "verified unblocked users create buddy posts" on public.buddy_posts;
create policy "ready users create buddy posts" on public.buddy_posts for insert to authenticated
  with check (owner_id=auth.uid() and moderation_status='approved' and public.is_profile_ready());
drop policy if exists "verified users request to join" on public.buddy_join_requests;
create policy "ready users request to join" on public.buddy_join_requests for insert to authenticated
  with check (requester_id=auth.uid() and public.is_profile_ready() and exists (
    select 1 from public.buddy_posts p where p.id=post_id and p.owner_id<>auth.uid() and p.moderation_status='approved' and p.status='active' and p.expires_at>=now()
  ));
drop policy if exists "authors create community posts" on public.community_posts;
create policy "ready authors create community posts" on public.community_posts for insert to authenticated
  with check (author_id=auth.uid() and status='active' and public.is_profile_ready());
drop policy if exists "authors write own community comments" on public.community_comments;
create policy "ready authors write own community comments" on public.community_comments for all to authenticated
  using (author_id=auth.uid()) with check (author_id=auth.uid() and status in ('active','deleted') and public.is_profile_ready() and exists (
    select 1 from public.community_posts p where p.id=post_id and p.status='active'
  ));
drop policy if exists "users manage own community reactions" on public.community_reactions;
create policy "ready users manage own community reactions" on public.community_reactions for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid() and public.is_profile_ready());

revoke all on public.profiles,public.profile_blocks,public.profile_reports,public.account_moderation_history from anon,authenticated;
grant select (username,display_name,bio,university_id,faculty_id,study_program,study_year,interests,avatar_url,profile_visibility,show_faculty,show_study_program,show_study_year,created_at) on public.profiles to anon,authenticated;
grant select,insert,delete on public.profile_blocks to authenticated;
grant select,insert,update on public.profile_reports to authenticated;
grant select on public.account_moderation_history to authenticated;
grant all on public.profiles,public.profile_blocks,public.profile_reports,public.account_moderation_history to service_role;
grant usage,select on sequence public.account_moderation_history_id_seq to service_role;

-- Soukromý bucket. Aplikace obrázky dekóduje, zmenší a zapisuje serverově;
-- uživatel má přímý přístup pouze ke své cestě, pokud je storage schéma dostupné.
do $storage$
begin
  if to_regclass('storage.objects') is not null and to_regclass('storage.buckets') is not null then
    execute $sql$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
      values ('profile-avatars','profile-avatars',false,1048576,array['image/webp'])
      on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types$sql$;
    execute $sql$create policy "profile avatar owner read" on storage.objects for select to authenticated
      using (bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text)$sql$;
  end if;
exception when duplicate_object then null;
end
$storage$;
