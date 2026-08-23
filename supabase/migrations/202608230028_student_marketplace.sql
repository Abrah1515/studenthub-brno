-- StudentHub Brno: Studentská burza. Oddělená od archivních technických žádostí.

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  city_id text not null default 'brno' references public.cities(id) on update cascade on delete restrict,
  listing_type text not null check (listing_type in ('offer','wanted')),
  category text not null check (category in ('textbook','scripts','own_notes','study_materials','calculator_equipment','other')),
  title text not null check (char_length(title) between 4 and 140),
  short_description text not null check (char_length(short_description) between 10 and 240),
  description text not null check (char_length(description) between 30 and 3000),
  price_mode text not null check (price_mode in ('fixed','free','negotiable')),
  price_amount integer check (price_amount is null or price_amount between 0 and 1000000),
  price_scope text not null default 'item' check (price_scope in ('item','bundle')),
  university_id text references public.universities(id) on update cascade on delete set null,
  faculty_id text references public.faculties(id) on update cascade on delete set null,
  study_program text check (study_program is null or char_length(study_program) <= 140),
  subject_name text check (subject_name is null or char_length(subject_name) <= 140),
  subject_code text check (subject_code is null or char_length(subject_code) <= 40),
  teacher_name text check (teacher_name is null or char_length(teacher_name) <= 120),
  recommended_year smallint check (recommended_year is null or recommended_year between 1 and 6),
  semester text not null default 'not_applicable' check (semester in ('winter','summer','both','not_applicable')),
  academic_year text check (academic_year is null or academic_year ~ '^20[0-9]{2}/20[0-9]{2}$'),
  material_format text not null check (material_format in ('printed','digital','both')),
  item_condition text check (item_condition is null or item_condition in ('new','like_new','used','worn')),
  handoff_method text not null check (handoff_method in ('in_person','shipping','digital','agreement')),
  handoff_location text check (handoff_location is null or char_length(handoff_location) between 2 and 120),
  public_alias text not null check (char_length(public_alias) between 2 and 50),
  seller_email text not null check (char_length(seller_email) between 5 and 254),
  seller_email_hash text not null check (seller_email_hash ~ '^[a-f0-9]{64}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{24}$'),
  verification_token_hash text unique check (verification_token_hash is null or verification_token_hash ~ '^[a-f0-9]{64}$'),
  verification_expires_at timestamptz,
  email_verified_at timestamptz,
  management_token_hash text not null unique check (management_token_hash ~ '^[a-f0-9]{64}$'),
  duplicate_fingerprint text not null check (duplicate_fingerprint ~ '^[a-f0-9]{64}$'),
  copyright_confirmed boolean not null,
  own_notes_confirmed boolean not null default false,
  privacy_consent_at timestamptz not null,
  status text not null default 'pending_verification' check (status in ('pending_verification','active','reserved','sold','expired','hidden','deleted','rejected')),
  report_count integer not null default 0 check (report_count >= 0),
  contact_count integer not null default 0 check (contact_count >= 0),
  automated_rejection_reason text check (automated_rejection_reason is null or char_length(automated_rejection_reason) <= 500),
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 1000),
  published_at timestamptz,
  expires_at timestamptz,
  renewed_at timestamptz,
  hidden_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((price_mode = 'fixed' and price_amount is not null and price_amount >= 0) or (price_mode = 'free' and price_amount = 0) or (price_mode = 'negotiable' and listing_type = 'wanted' and price_amount is null)),
  check (material_format = 'digital' or item_condition is not null),
  check (material_format <> 'digital' or item_condition is null),
  check (category <> 'own_notes' or own_notes_confirmed),
  check (copyright_confirmed),
  check ((status = 'pending_verification' and verification_token_hash is not null and verification_expires_at is not null and email_verified_at is null and published_at is null) or status <> 'pending_verification'),
  check ((status in ('active','reserved','sold','expired','hidden') and email_verified_at is not null and published_at is not null) or status not in ('active','reserved','sold','expired','hidden'))
);

create table if not exists public.marketplace_listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  storage_path text not null unique check (storage_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$'),
  sort_order smallint not null check (sort_order between 0 and 2),
  width integer not null check (width between 1 and 2000),
  height integer not null check (height between 1 and 2000),
  mime_type text not null default 'image/webp' check (mime_type = 'image/webp'),
  size_bytes integer not null check (size_bytes between 1 and 2097152),
  created_at timestamptz not null default now(),
  unique (listing_id,sort_order)
);

create table if not exists public.marketplace_messages (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  buyer_email text not null check (char_length(buyer_email) between 5 and 254),
  message text not null check (char_length(message) between 20 and 2000),
  consent_at timestamptz not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{24}$'),
  delivery_status text not null default 'pending' check (delivery_status in ('pending','sent','failed','rejected')),
  delivery_provider_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  reporter_hash text not null check (reporter_hash ~ '^[a-f0-9]{24}$'),
  reason text not null check (reason in ('fraud','copyright','academic_integrity','illegal','sold','privacy','spam','other')),
  detail text not null default '' check (char_length(detail) <= 1000),
  status text not null default 'new' check (status in ('new','reviewed','resolved','dismissed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  resolution text check (resolution is null or char_length(resolution) <= 1000),
  created_at timestamptz not null default now(),
  unique (listing_id,reporter_hash)
);

create table if not exists public.marketplace_history (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  event_type text not null check (event_type in ('created','email_verified','updated','reserved','sold','reopened','renewed','expired','hidden','restored','deleted','rejected','contacted','reported')),
  previous_status text,
  new_status text,
  actor_type text not null default 'system' check (actor_type in ('seller','buyer','moderator','system')),
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_moderation_actions (
  id bigint generated always as identity primary key,
  listing_id uuid references public.marketplace_listings(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('hide','restore','delete','resolve_report','dismiss_report','block_abuse','view_sensitive')),
  reason text not null check (char_length(reason) between 2 and 1000),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_abuse_blocks (
  id uuid primary key default gen_random_uuid(),
  identifier_hash text not null unique check (identifier_hash ~ '^[a-f0-9]{64}$'),
  reason text not null check (char_length(reason) between 2 and 1000),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_rate_limits (
  id bigint generated always as identity primary key,
  key_hash text not null check (key_hash ~ '^[a-f0-9]{24}$'),
  action text not null check (char_length(action) between 2 and 40),
  occurred_at timestamptz not null default now()
);

create unique index if not exists marketplace_active_duplicate_idx on public.marketplace_listings(seller_email_hash,duplicate_fingerprint) where status in ('pending_verification','active','reserved','hidden');
create index if not exists marketplace_public_newest_idx on public.marketplace_listings(city_id,created_at desc,id desc) where status in ('active','reserved','sold');
create index if not exists marketplace_scope_idx on public.marketplace_listings(city_id,university_id,faculty_id,recommended_year,created_at desc) where status in ('active','reserved');
create index if not exists marketplace_filter_idx on public.marketplace_listings(city_id,listing_type,category,material_format,status,price_amount);
create index if not exists marketplace_expiration_idx on public.marketplace_listings(expires_at) where status in ('active','reserved','sold');
create index if not exists marketplace_reports_queue_idx on public.marketplace_reports(status,created_at desc);
create index if not exists marketplace_messages_listing_idx on public.marketplace_messages(listing_id,created_at desc);
create index if not exists marketplace_history_listing_idx on public.marketplace_history(listing_id,created_at desc);
create index if not exists marketplace_moderation_listing_idx on public.marketplace_moderation_actions(listing_id,created_at desc);
create index if not exists marketplace_rate_limit_idx on public.marketplace_rate_limits(key_hash,action,occurred_at desc);

drop trigger if exists marketplace_listings_updated on public.marketplace_listings;
create trigger marketplace_listings_updated before update on public.marketplace_listings for each row execute function public.set_updated_at();
drop trigger if exists marketplace_abuse_blocks_updated on public.marketplace_abuse_blocks;
create trigger marketplace_abuse_blocks_updated before update on public.marketplace_abuse_blocks for each row execute function public.set_updated_at();

create or replace function public.consume_marketplace_rate_limit(p_key_hash text,p_action text,p_limit integer,p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare total integer;
begin
  if p_key_hash !~ '^[a-f0-9]{24}$' or char_length(p_action) not between 2 and 40 or p_limit not between 1 and 100 or p_window_seconds not between 60 and 604800 then return false; end if;
  perform pg_advisory_xact_lock(hashtext(p_key_hash || ':' || p_action));
  delete from public.marketplace_rate_limits where occurred_at < now() - interval '8 days';
  select count(*)::integer into total from public.marketplace_rate_limits where key_hash=p_key_hash and action=p_action and occurred_at > now() - make_interval(secs => p_window_seconds);
  if total >= p_limit then return false; end if;
  insert into public.marketplace_rate_limits(key_hash,action) values (p_key_hash,p_action);
  return true;
end;
$$;

create or replace function public.expire_marketplace_listings() returns integer
language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  with candidates as (
    select id,status as previous_status from public.marketplace_listings
    where status in ('active','reserved','sold') and expires_at <= now()
    for update
  ), expired as (
    update public.marketplace_listings as listing set status='expired'
    from candidates where listing.id=candidates.id
    returning listing.id,candidates.previous_status
  )
  insert into public.marketplace_history(listing_id,event_type,previous_status,new_status,actor_type)
    select id,'expired',previous_status,'expired','system' from expired;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.marketplace_report_moderation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare total integer; current_status text;
begin
  select count(distinct reporter_hash)::integer into total from public.marketplace_reports where listing_id=new.listing_id and status in ('new','reviewed');
  select status into current_status from public.marketplace_listings where id=new.listing_id;
  update public.marketplace_listings set report_count=total,status=case when total >= 3 and status in ('active','reserved','sold') then 'hidden' else status end,hidden_at=case when total >= 3 and status in ('active','reserved','sold') then now() else hidden_at end where id=new.listing_id;
  insert into public.marketplace_history(listing_id,event_type,previous_status,new_status,actor_type,changes) values (new.listing_id,'reported',current_status,case when total >= 3 and current_status in ('active','reserved','sold') then 'hidden' else current_status end,'buyer',jsonb_build_object('reason',new.reason,'report_count',total));
  return new;
end;
$$;
drop trigger if exists marketplace_reports_moderate on public.marketplace_reports;
create trigger marketplace_reports_moderate after insert on public.marketplace_reports for each row execute function public.marketplace_report_moderation();

alter table public.marketplace_listings enable row level security;
alter table public.marketplace_listing_photos enable row level security;
alter table public.marketplace_messages enable row level security;
alter table public.marketplace_reports enable row level security;
alter table public.marketplace_history enable row level security;
alter table public.marketplace_moderation_actions enable row level security;
alter table public.marketplace_abuse_blocks enable row level security;
alter table public.marketplace_rate_limits enable row level security;

revoke all on public.marketplace_listings,public.marketplace_listing_photos,public.marketplace_messages,public.marketplace_reports,public.marketplace_history,public.marketplace_moderation_actions,public.marketplace_abuse_blocks,public.marketplace_rate_limits from anon,authenticated;
grant all on public.marketplace_listings,public.marketplace_listing_photos,public.marketplace_messages,public.marketplace_reports,public.marketplace_history,public.marketplace_moderation_actions,public.marketplace_abuse_blocks,public.marketplace_rate_limits to service_role;
grant usage,select on sequence public.marketplace_history_id_seq,public.marketplace_moderation_actions_id_seq,public.marketplace_rate_limits_id_seq to service_role;
revoke all on function public.consume_marketplace_rate_limit(text,text,integer,integer),public.expire_marketplace_listings() from public,anon,authenticated;
grant execute on function public.consume_marketplace_rate_limit(text,text,integer,integer),public.expire_marketplace_listings() to service_role;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
      values ('marketplace-images','marketplace-images',false,2097152,array['image/webp'])
      on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
  end if;
end;
$$;

-- Expirace je obranně řešena i při veřejném čtení; v Supabase ji navíc spouští pg_cron.
do $$
begin
  if exists (select 1 from pg_namespace where nspname='cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='studenthub-marketplace-expiration';
    perform cron.schedule('studenthub-marketplace-expiration','17 * * * *','select public.expire_marketplace_listings();');
  end if;
end;
$$;
