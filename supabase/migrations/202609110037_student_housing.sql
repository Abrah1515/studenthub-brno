-- StudentHub Brno: samostatný modul studentského bydlení.
-- Veřejná vrstva neobsahuje přesné adresy ani kontaktní údaje; kontakt probíhá přes chat.

create table if not exists public.housing_listings (
  id uuid primary key default gen_random_uuid(),
  city_id text not null default 'brno' references public.cities(id) on update cascade on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  listing_type text not null check (listing_type in ('offer','wanted')),
  category text not null check (category in ('private_room','shared_room','apartment','dormitory','roommate','other')),
  title text not null check (char_length(title) between 5 and 120),
  locality text not null check (char_length(locality) between 2 and 100),
  available_from date not null,
  stay_length text not null check (stay_length in ('under_3_months','3_6_months','6_12_months','over_year','indefinite','agreement')),
  short_description text not null check (char_length(short_description) between 20 and 240),
  description text not null check (char_length(description) between 50 and 4000),
  price_monthly integer check (price_monthly is null or price_monthly between 0 and 200000),
  utilities_included boolean not null default false,
  utilities_amount integer check (utilities_amount is null or utilities_amount between 0 and 100000),
  deposit_amount integer check (deposit_amount is null or deposit_amount between 0 and 500000),
  available_spots smallint check (available_spots is null or available_spots between 1 and 20),
  current_occupants smallint check (current_occupants is null or current_occupants between 0 and 30),
  furnished boolean,
  transit_access text check (transit_access is null or char_length(transit_access) <= 160),
  features text[] not null default '{}',
  wanted_person_count smallint check (wanted_person_count is null or wanted_person_count between 1 and 10),
  lifestyle_preferences text[] not null default '{}',
  status text not null default 'active' check (status in ('active','pending_review','hidden','occupied','found','expired','rejected','deleted')),
  moderation_flags text[] not null default '{}',
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 1000),
  duplicate_fingerprint text not null check (duplicate_fingerprint ~ '^[a-f0-9]{64}$'),
  report_count integer not null default 0 check (report_count >= 0),
  view_count integer not null default 0 check (view_count >= 0),
  contact_count integer not null default 0 check (contact_count >= 0),
  version integer not null default 1 check (version > 0),
  published_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  renewed_at timestamptz,
  hidden_at timestamptz,
  closed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((listing_type='offer' and price_monthly is not null and available_spots is not null and wanted_person_count is null)
      or (listing_type='wanted' and price_monthly is not null and wanted_person_count is not null and available_spots is null)),
  check (utilities_included or utilities_amount is not null),
  check (features <@ array['internet','washer','balcony','cellar','elevator','accessible','pets','smoking']::text[]),
  check (lifestyle_preferences <@ array['non_smoking','smoking_ok','pets_ok','no_pets','quiet_home','social_home']::text[]),
  check ((status='active' and published_at is not null) or status<>'active')
);

create table if not exists public.housing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.housing_listings(id) on delete cascade,
  storage_path text not null unique check (storage_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$'),
  sort_order smallint not null check (sort_order between 0 and 7),
  width integer not null check (width between 1 and 2400),
  height integer not null check (height between 1 and 2400),
  mime_type text not null default 'image/webp' check (mime_type='image/webp'),
  size_bytes integer not null check (size_bytes between 1 and 3145728),
  created_at timestamptz not null default now(),
  unique(listing_id,sort_order)
);

create table if not exists public.housing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.housing_listings(id) on delete restrict,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('fake','fraud','outdated','discrimination','public_contact','inappropriate_photo','harassment','other')),
  detail text not null default '' check (char_length(detail) <= 1200),
  status text not null default 'new' check (status in ('new','reviewed','resolved','dismissed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  resolution text check (resolution is null or char_length(resolution) <= 1000),
  created_at timestamptz not null default now(),
  unique(listing_id,reporter_id)
);

create table if not exists public.housing_history (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.housing_listings(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('created','updated','submitted_review','approved','rejected','hidden','restored','occupied','found','renewed','expired','deleted','reported','contacted')),
  previous_status text,
  new_status text,
  changes jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.housing_moderation_actions (
  id bigint generated always as identity primary key,
  listing_id uuid references public.housing_listings(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('approve','reject','hide','restore','delete','resolve_report','dismiss_report','restrict_author')),
  reason text not null check (char_length(reason) between 2 and 1000),
  previous_status text,
  new_status text,
  created_at timestamptz not null default now()
);

create table if not exists public.housing_daily_stats (
  listing_id uuid not null references public.housing_listings(id) on delete cascade,
  day date not null default current_date,
  views integer not null default 0 check (views >= 0),
  contacts integer not null default 0 check (contacts >= 0),
  primary key(listing_id,day)
);

create table if not exists public.housing_rate_limits (
  id bigint generated always as identity primary key,
  key_hash text not null check (key_hash ~ '^[a-f0-9]{24}$'),
  action text not null check (char_length(action) between 2 and 40),
  occurred_at timestamptz not null default now()
);

create table if not exists public.housing_maintenance_runs (
  id bigint generated always as identity primary key,
  status text not null check (status in ('running','success','failed')),
  expired_count integer not null default 0,
  orphan_photo_count integer not null default 0,
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists housing_public_newest_idx on public.housing_listings(city_id,listing_type,published_at desc,id desc) where status='active';
create index if not exists housing_filter_idx on public.housing_listings(city_id,listing_type,category,locality,price_monthly,available_from) where status='active';
create index if not exists housing_author_idx on public.housing_listings(author_id,created_at desc);
create unique index if not exists housing_active_duplicate_idx on public.housing_listings(author_id,duplicate_fingerprint) where status in ('active','pending_review','hidden');
create index if not exists housing_expiration_idx on public.housing_listings(expires_at) where status='active';
create index if not exists housing_pending_idx on public.housing_listings(city_id,status,created_at desc) where status in ('pending_review','hidden');
create index if not exists housing_reports_queue_idx on public.housing_reports(status,created_at desc);
create index if not exists housing_history_listing_idx on public.housing_history(listing_id,created_at desc);
create index if not exists housing_rate_limit_idx on public.housing_rate_limits(key_hash,action,occurred_at desc);

drop trigger if exists housing_listings_updated on public.housing_listings;
create trigger housing_listings_updated before update on public.housing_listings for each row execute function public.set_updated_at();

create or replace function public.consume_housing_rate_limit(p_key_hash text,p_action text,p_limit integer,p_window_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare total integer;
begin
  if p_key_hash !~ '^[a-f0-9]{24}$' or char_length(p_action) not between 2 and 40 or p_limit not between 1 and 200 or p_window_seconds not between 30 and 604800 then return false; end if;
  perform pg_advisory_xact_lock(hashtext(p_key_hash||':'||p_action));
  delete from public.housing_rate_limits where occurred_at < now()-interval '8 days';
  select count(*)::integer into total from public.housing_rate_limits where key_hash=p_key_hash and action=p_action and occurred_at>now()-make_interval(secs=>p_window_seconds);
  if total>=p_limit then return false; end if;
  insert into public.housing_rate_limits(key_hash,action) values(p_key_hash,p_action);
  return true;
end $$;

create or replace function public.expire_housing_listings() returns integer
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  with candidates as (
    select id,status from public.housing_listings where status='active' and expires_at<=now() for update
  ), changed as (
    update public.housing_listings h set status='expired',closed_at=now(),version=h.version+1
    from candidates c where h.id=c.id returning h.id,c.status
  )
  insert into public.housing_history(listing_id,event_type,previous_status,new_status)
    select id,'expired',status,'expired' from changed;
  get diagnostics affected=row_count;
  return affected;
end $$;

create or replace function public.increment_housing_view(target_listing uuid) returns void
language sql security definer set search_path='' as $$
  update public.housing_listings set view_count=view_count+1 where id=target_listing and status='active' and expires_at>now();
  insert into public.housing_daily_stats(listing_id,day,views) select target_listing,current_date,1 where exists(select 1 from public.housing_listings where id=target_listing and status='active')
    on conflict(listing_id,day) do update set views=public.housing_daily_stats.views+1;
$$;

create or replace function public.increment_housing_contact(target_listing uuid) returns void
language sql security definer set search_path='' as $$
  update public.housing_listings set contact_count=contact_count+1 where id=target_listing and status='active' and expires_at>now();
  insert into public.housing_daily_stats(listing_id,day,contacts) select target_listing,current_date,1 where exists(select 1 from public.housing_listings where id=target_listing and status='active')
    on conflict(listing_id,day) do update set contacts=public.housing_daily_stats.contacts+1;
$$;

create or replace function public.housing_report_moderation() returns trigger
language plpgsql security definer set search_path='' as $$
declare total integer; previous text;
begin
  select count(*)::integer into total from public.housing_reports where listing_id=new.listing_id and status in ('new','reviewed');
  select status into previous from public.housing_listings where id=new.listing_id;
  update public.housing_listings set report_count=total,status=case when total>=3 and status='active' then 'hidden' else status end,
    hidden_at=case when total>=3 and status='active' then now() else hidden_at end,version=version+1 where id=new.listing_id;
  insert into public.housing_history(listing_id,actor_id,event_type,previous_status,new_status,changes)
    values(new.listing_id,new.reporter_id,'reported',previous,case when total>=3 and previous='active' then 'hidden' else previous end,jsonb_build_object('reason',new.reason,'report_count',total));
  return new;
end $$;
drop trigger if exists housing_reports_moderate on public.housing_reports;
create trigger housing_reports_moderate after insert on public.housing_reports for each row execute function public.housing_report_moderation();

alter table public.housing_listings enable row level security;
alter table public.housing_photos enable row level security;
alter table public.housing_reports enable row level security;
alter table public.housing_history enable row level security;
alter table public.housing_moderation_actions enable row level security;
alter table public.housing_daily_stats enable row level security;
alter table public.housing_rate_limits enable row level security;
alter table public.housing_maintenance_runs enable row level security;

create policy "public read active housing" on public.housing_listings for select to anon,authenticated
  using (status='active' and published_at is not null and expires_at>now());
create policy "authors read own housing" on public.housing_listings for select to authenticated using (author_id=auth.uid());
create policy "city staff read housing" on public.housing_listings for select to authenticated using (public.can_manage_city(city_id));
create policy "public read active housing photos" on public.housing_photos for select to anon,authenticated
  using (exists(select 1 from public.housing_listings h where h.id=listing_id and h.status='active' and h.expires_at>now()));
create policy "authors read housing history" on public.housing_history for select to authenticated
  using (exists(select 1 from public.housing_listings h where h.id=listing_id and (h.author_id=auth.uid() or public.can_manage_city(h.city_id))));
create policy "reporters read own housing reports" on public.housing_reports for select to authenticated using (reporter_id=auth.uid());
create policy "city staff read housing reports" on public.housing_reports for select to authenticated
  using (exists(select 1 from public.housing_listings h where h.id=listing_id and public.can_manage_city(h.city_id)));
create policy "city staff read housing actions" on public.housing_moderation_actions for select to authenticated
  using (listing_id is null or exists(select 1 from public.housing_listings h where h.id=listing_id and public.can_manage_city(h.city_id)));

revoke all on public.housing_listings,public.housing_photos,public.housing_reports,public.housing_history,public.housing_moderation_actions,public.housing_daily_stats,public.housing_rate_limits,public.housing_maintenance_runs from anon,authenticated;
grant select(id,city_id,author_id,listing_type,category,title,locality,available_from,stay_length,short_description,description,price_monthly,utilities_included,utilities_amount,deposit_amount,available_spots,current_occupants,furnished,transit_access,features,wanted_person_count,lifestyle_preferences,status,published_at,expires_at,created_at,updated_at) on public.housing_listings to anon,authenticated;
grant select on public.housing_photos to anon,authenticated;
grant select on public.housing_history,public.housing_reports,public.housing_moderation_actions to authenticated;
grant all on public.housing_listings,public.housing_photos,public.housing_reports,public.housing_history,public.housing_moderation_actions,public.housing_daily_stats,public.housing_rate_limits,public.housing_maintenance_runs to service_role;
grant usage,select on sequence public.housing_history_id_seq,public.housing_moderation_actions_id_seq,public.housing_rate_limits_id_seq,public.housing_maintenance_runs_id_seq to service_role;
revoke all on function public.consume_housing_rate_limit(text,text,integer,integer),public.expire_housing_listings(),public.increment_housing_view(uuid),public.increment_housing_contact(uuid) from public,anon,authenticated;
grant execute on function public.consume_housing_rate_limit(text,text,integer,integer),public.expire_housing_listings(),public.increment_housing_view(uuid),public.increment_housing_contact(uuid) to service_role;

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
      values('housing-images','housing-images',false,3145728,array['image/webp'])
      on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
  end if;
end $$;

-- Bydlení je nový bezpečný kontext existujícího dvoustranného chatu.
alter table public.chat_conversations drop constraint if exists chat_conversations_context_type_check;
alter table public.chat_conversations add constraint chat_conversations_context_type_check check (context_type in ('profile','buddy_post','marketplace_listing','housing_listing'));

create or replace function public.assign_chat_city()
returns trigger language plpgsql security definer set search_path='' as $$
declare resolved_city text;
begin
  if new.context_type='buddy_post' then select city_id into resolved_city from public.buddy_posts where id=new.context_id;
  elsif new.context_type='marketplace_listing' then select city_id into resolved_city from public.marketplace_listings where id=new.context_id;
  elsif new.context_type='housing_listing' then select city_id into resolved_city from public.housing_listings where id=new.context_id;
  elsif new.context_type='profile' then select city_id into resolved_city from public.profiles where id=new.initiator_id;
  end if;
  resolved_city:=coalesce(resolved_city,(select city_id from public.profiles where id=new.recipient_id));
  if resolved_city is null then raise exception 'chat_city_unavailable'; end if;
  if new.city_id is not null and new.city_id<>resolved_city then raise exception 'chat_city_mismatch'; end if;
  new.city_id:=resolved_city; return new;
end $$;

create or replace function public.start_chat_request(target_profile uuid,target_context_type text,target_context_id uuid,first_body text,message_nonce uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); conversation_id uuid; context_owner uuid; existing_status text; cooldown timestamptz;
begin
  if actor is null or actor=target_profile then raise exception 'chat_invalid_participants'; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(actor::text,target_profile::text)||greatest(actor::text,target_profile::text)||target_context_type||target_context_id::text,0));
  if not public.consume_chat_rate_limit('new_request',20,86400) then raise exception 'chat_request_rate_limit'; end if;
  if not exists(select 1 from public.profiles p where p.id=actor and p.account_status='active' and p.username is not null and p.community_rules_accepted_at is not null) then raise exception 'chat_profile_incomplete'; end if;
  if not exists(select 1 from public.profiles p where p.id=target_profile and p.account_status='active' and p.username is not null and p.community_rules_accepted_at is not null and p.allow_chat_requests) then raise exception 'chat_recipient_unavailable'; end if;
  if public.chat_profiles_blocked(actor,target_profile) then raise exception 'chat_blocked'; end if;
  if target_context_type='profile' then select id into context_owner from public.profiles where id=target_context_id and id=target_profile and profile_visibility='public' and account_status='active';
  elsif target_context_type='buddy_post' then select owner_id into context_owner from public.buddy_posts where id=target_context_id and owner_id=target_profile and status='active' and moderation_status='approved' and expires_at>=now();
  elsif target_context_type='marketplace_listing' then select seller_id into context_owner from public.marketplace_listings where id=target_context_id and seller_id=target_profile and status in ('active','reserved') and expires_at>=now();
  elsif target_context_type='housing_listing' then select author_id into context_owner from public.housing_listings where id=target_context_id and author_id=target_profile and status='active' and expires_at>=now();
  else raise exception 'chat_invalid_context'; end if;
  if context_owner is null then raise exception 'chat_context_unavailable'; end if;
  select id,status into conversation_id,existing_status from public.chat_conversations where least(initiator_id,recipient_id)=least(actor,target_profile) and greatest(initiator_id,recipient_id)=greatest(actor,target_profile) and context_type=target_context_type and context_id=target_context_id and status in ('requested','active','restricted') order by created_at desc limit 1;
  if conversation_id is not null then return conversation_id; end if;
  select max(decline_until) into cooldown from public.chat_conversations where least(initiator_id,recipient_id)=least(actor,target_profile) and greatest(initiator_id,recipient_id)=greatest(actor,target_profile) and context_type=target_context_type and context_id=target_context_id and status='declined';
  if cooldown is not null and cooldown>now() then raise exception 'chat_declined_cooldown'; end if;
  insert into public.chat_conversations(initiator_id,recipient_id,context_type,context_id) values(actor,target_profile,target_context_type,target_context_id) returning id into conversation_id;
  insert into public.chat_conversation_members(conversation_id,profile_id) values(conversation_id,actor),(conversation_id,target_profile);
  insert into public.chat_messages(conversation_id,sender_id,client_nonce,body) values(conversation_id,actor,message_nonce,first_body);
  return conversation_id;
end $$;
revoke all on function public.start_chat_request(uuid,text,uuid,text,uuid) from public,anon;
grant execute on function public.start_chat_request(uuid,text,uuid,text,uuid) to authenticated,service_role;

do $$ begin
  if exists(select 1 from pg_namespace where nspname='cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='studenthub-housing-expiration';
    perform cron.schedule('studenthub-housing-expiration','23 * * * *','select public.expire_housing_listings();');
  end if;
end $$;
