-- StudentHub Brno: studentské fórum s ověřenými autory, reakcemi a auditovatelnou moderací.

create table public.community_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 40),
  city_id text not null default 'brno' references public.cities(id) on update cascade on delete restrict,
  university_id text references public.universities(id) on update cascade on delete set null,
  faculty_id text references public.faculties(id) on update cascade on delete set null,
  status text not null default 'active' check (status in ('active','blocked','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete set null,
  author_nickname text not null check (char_length(author_nickname) between 2 and 40),
  city_id text not null references public.cities(id) on update cascade on delete restrict,
  university_id text references public.universities(id) on update cascade on delete set null,
  faculty_id text references public.faculties(id) on update cascade on delete set null,
  place_id uuid references public.places(id) on delete set null,
  category text not null check (category in ('Kafe a jídlo','Studium','Bydlení','Doprava','Akce','Technika','Tipy po Brně','Ostatní')),
  body text not null check (char_length(body) between 2 and 500),
  image_url text check (image_url is null or image_url ~ '^https://'),
  status text not null default 'active' check (status in ('active','hidden','deleted')),
  helpful_count integer not null default 0 check (helpful_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  report_count integer not null default 0 check (report_count >= 0),
  duplicate_fingerprint text not null check (duplicate_fingerprint ~ '^[a-f0-9]{64}$'),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete restrict,
  author_id uuid references public.profiles(id) on delete set null,
  author_nickname text not null check (char_length(author_nickname) between 2 and 40),
  body text not null check (char_length(body) between 2 and 300),
  status text not null default 'active' check (status in ('active','hidden','deleted')),
  is_best boolean not null default false,
  helpful_count integer not null default 0 check (helpful_count >= 0),
  report_count integer not null default 0 check (report_count >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_reactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id,target_type,target_id)
);

create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment')),
  target_id uuid not null,
  reason text not null check (reason in ('spam','harassment','hate','privacy','fraud','dangerous','other')),
  detail text not null default '' check (char_length(detail) <= 800),
  city_id text not null references public.cities(id) on update cascade on delete restrict,
  status text not null default 'new' check (status in ('new','reviewed','dismissed','actioned')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (reporter_id,target_type,target_id)
);

create table public.community_moderation_history (
  id bigint generated always as identity primary key,
  city_id text not null references public.cities(id) on update cascade on delete restrict,
  target_type text not null check (target_type in ('post','comment','author')),
  target_id uuid not null,
  action text not null check (action in ('auto_hidden','hidden','restored','deleted','author_blocked','report_dismissed')),
  actor_id uuid references public.profiles(id) on delete set null,
  reason text not null default '' check (char_length(reason) <= 800),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.community_moderation_settings (
  city_id text primary key references public.cities(id) on update cascade on delete cascade,
  auto_hide_threshold integer not null default 3 check (auto_hide_threshold between 2 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.community_moderation_settings(city_id) select id from public.cities on conflict do nothing;

create unique index community_posts_active_duplicate_idx on public.community_posts(author_id,duplicate_fingerprint) where status in ('active','hidden');
create index community_posts_newest_idx on public.community_posts(city_id,created_at desc,id desc) where status = 'active';
create index community_posts_popular_idx on public.community_posts(city_id,helpful_count desc,comment_count desc,created_at desc) where status = 'active';
create index community_posts_category_idx on public.community_posts(city_id,category,created_at desc) where status = 'active';
create index community_posts_scope_idx on public.community_posts(city_id,university_id,faculty_id,created_at desc) where status = 'active';
create index community_posts_author_idx on public.community_posts(author_id,created_at desc);
create index community_comments_post_idx on public.community_comments(post_id,created_at,id) where status = 'active';
create index community_comments_author_idx on public.community_comments(author_id,created_at desc);
create unique index community_comments_one_best_idx on public.community_comments(post_id) where is_best and status = 'active';
create index community_reactions_target_idx on public.community_reactions(target_type,target_id);
create index community_reports_queue_idx on public.community_reports(city_id,status,created_at desc);
create index community_moderation_history_target_idx on public.community_moderation_history(target_type,target_id,created_at desc);

create trigger community_profiles_updated before update on public.community_profiles for each row execute function public.set_updated_at();
create trigger community_posts_updated before update on public.community_posts for each row execute function public.set_updated_at();
create trigger community_comments_updated before update on public.community_comments for each row execute function public.set_updated_at();

create or replace function public.refresh_community_reaction_count() returns trigger
language plpgsql security definer set search_path = '' as $$
declare kind text := coalesce(new.target_type,old.target_type); target uuid := coalesce(new.target_id,old.target_id); total integer;
begin
  select count(*)::integer into total from public.community_reactions where target_type = kind and target_id = target;
  if kind = 'post' then update public.community_posts set helpful_count = total where id = target;
  else update public.community_comments set helpful_count = total where id = target; end if;
  return coalesce(new,old);
end;
$$;
create trigger community_reactions_refresh after insert or delete on public.community_reactions for each row execute function public.refresh_community_reaction_count();

create or replace function public.refresh_community_comment_count() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target uuid := coalesce(new.post_id,old.post_id); total integer;
begin
  select count(*)::integer into total from public.community_comments where post_id = target and status = 'active';
  update public.community_posts set comment_count = total where id = target;
  return coalesce(new,old);
end;
$$;
create trigger community_comments_refresh after insert or delete or update of status on public.community_comments for each row execute function public.refresh_community_comment_count();

create or replace function public.moderate_reported_community_content() returns trigger
language plpgsql security definer set search_path = '' as $$
declare total integer; threshold integer; current_city text; current_status text;
begin
  select count(distinct reporter_id)::integer into total from public.community_reports
    where target_type = new.target_type and target_id = new.target_id and status in ('new','reviewed');
  select auto_hide_threshold into threshold from public.community_moderation_settings where city_id = new.city_id;
  threshold := coalesce(threshold,3);
  if new.target_type = 'post' then
    select city_id,status into current_city,current_status from public.community_posts where id = new.target_id;
    if current_city is distinct from new.city_id then raise exception 'report city does not match target'; end if;
    update public.community_posts set report_count = total, status = case when total >= threshold and status = 'active' then 'hidden' else status end where id = new.target_id;
  else
    select p.city_id,c.status into current_city,current_status from public.community_comments c join public.community_posts p on p.id=c.post_id where c.id = new.target_id;
    if current_city is distinct from new.city_id then raise exception 'report city does not match target'; end if;
    update public.community_comments set report_count = total, status = case when total >= threshold and status = 'active' then 'hidden' else status end where id = new.target_id;
  end if;
  if total >= threshold and current_status = 'active' then
    insert into public.community_moderation_history(city_id,target_type,target_id,action,reason,snapshot)
      values (new.city_id,new.target_type,new.target_id,'auto_hidden','Dosažen limit nezávislých hlášení',jsonb_build_object('report_count',total,'threshold',threshold));
  end if;
  return new;
end;
$$;
create trigger community_reports_auto_moderate after insert on public.community_reports for each row execute function public.moderate_reported_community_content();

create or replace function public.protect_community_post_author_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.can_manage_city(old.city_id) then return new; end if;
  if old.status <> 'active' or new.status not in ('active','deleted') then raise exception 'hidden or deleted community content cannot be restored by author'; end if;
  if new.author_id is distinct from old.author_id or new.helpful_count is distinct from old.helpful_count or new.report_count is distinct from old.report_count or new.comment_count is distinct from old.comment_count then raise exception 'protected community fields cannot be changed by author'; end if;
  return new;
end;
$$;
create or replace function public.protect_community_comment_author_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_city text;
begin
  if auth.uid() is null then return new; end if;
  select city_id into target_city from public.community_posts where id=old.post_id;
  if public.can_manage_city(target_city) then return new; end if;
  if old.status <> 'active' or new.status not in ('active','deleted') then raise exception 'hidden or deleted community content cannot be restored by author'; end if;
  if new.author_id is distinct from old.author_id or new.helpful_count is distinct from old.helpful_count or new.report_count is distinct from old.report_count or new.is_best is distinct from old.is_best then raise exception 'protected community fields cannot be changed by author'; end if;
  return new;
end;
$$;
create trigger community_posts_protect_author before update on public.community_posts for each row execute function public.protect_community_post_author_update();
create trigger community_comments_protect_author before update on public.community_comments for each row execute function public.protect_community_comment_author_update();

alter table public.community_profiles enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_moderation_history enable row level security;
alter table public.community_moderation_settings enable row level security;

create policy "community profile owner reads" on public.community_profiles for select to authenticated using (user_id = auth.uid() or public.can_manage_city(city_id));
create policy "community profile owner writes" on public.community_profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_verified_user());
create policy "public reads active community posts" on public.community_posts for select to anon,authenticated using (status = 'active');
create policy "authors read own community posts" on public.community_posts for select to authenticated using (author_id = auth.uid());
create policy "authors create community posts" on public.community_posts for insert to authenticated with check (author_id = auth.uid() and status = 'active' and public.is_verified_user());
create policy "authors update own community posts" on public.community_posts for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid() and status in ('active','deleted'));
create policy "city staff moderate community posts" on public.community_posts for all to authenticated using (public.can_manage_city(city_id)) with check (public.can_manage_city(city_id));
create policy "public reads active community comments" on public.community_comments for select to anon,authenticated using (status = 'active' and exists (select 1 from public.community_posts p where p.id=post_id and p.status='active'));
create policy "authors read own community comments" on public.community_comments for select to authenticated using (author_id = auth.uid());
create policy "authors write own community comments" on public.community_comments for all to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid() and status in ('active','deleted') and public.is_verified_user() and exists (select 1 from public.community_posts p where p.id=post_id and p.status='active'));
create policy "city staff moderate community comments" on public.community_comments for all to authenticated using (exists (select 1 from public.community_posts p where p.id=post_id and public.can_manage_city(p.city_id))) with check (exists (select 1 from public.community_posts p where p.id=post_id and public.can_manage_city(p.city_id)));
create policy "users manage own community reactions" on public.community_reactions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_verified_user());
create policy "users create own community reports" on public.community_reports for insert to authenticated with check (reporter_id = auth.uid() and public.is_verified_user());
create policy "city staff manage community reports" on public.community_reports for all to authenticated using (public.can_manage_city(city_id)) with check (public.can_manage_city(city_id));
create policy "city staff reads community history" on public.community_moderation_history for select to authenticated using (public.can_manage_city(city_id));
create policy "city staff manages community settings" on public.community_moderation_settings for all to authenticated using (public.can_manage_city(city_id)) with check (public.can_manage_city(city_id));

revoke all on public.community_profiles,public.community_posts,public.community_comments,public.community_reactions,public.community_reports,public.community_moderation_history,public.community_moderation_settings from anon,authenticated;
grant select (id,author_nickname,city_id,university_id,faculty_id,place_id,category,body,image_url,status,helpful_count,comment_count,report_count,created_at,updated_at) on public.community_posts to anon,authenticated;
grant select (id,post_id,author_nickname,body,status,is_best,helpful_count,report_count,created_at,updated_at) on public.community_comments to anon,authenticated;
grant select on public.community_profiles,public.community_reports,public.community_moderation_history,public.community_moderation_settings to authenticated;
grant insert (user_id,nickname,city_id,university_id,faculty_id), update (nickname,city_id,university_id,faculty_id) on public.community_profiles to authenticated;
grant insert (author_id,author_nickname,city_id,university_id,faculty_id,place_id,category,body,image_url,status,duplicate_fingerprint), update (author_nickname,university_id,faculty_id,place_id,category,body,status,deleted_at,duplicate_fingerprint) on public.community_posts to authenticated;
grant insert (post_id,author_id,author_nickname,body,status), update (body,status,deleted_at) on public.community_comments to authenticated;
grant all on public.community_profiles,public.community_posts,public.community_comments,public.community_reactions,public.community_reports,public.community_moderation_history,public.community_moderation_settings to service_role;
grant usage,select on sequence public.community_reactions_id_seq,public.community_moderation_history_id_seq to service_role;
