-- První fáze Olomouce: neveřejná edice, konfigurovatelné moduly a ochrana
-- veřejných dat před čtením z města, které ještě nebylo publikováno.

alter table public.cities
  add column if not exists module_config jsonb not null default '{
    "calendar": false, "places": false, "community": false, "buddy": false,
    "marketplace": false, "housing": false, "jobs": false, "chat": false,
    "watcher": false, "settings": false, "offers": false
  }'::jsonb;

alter table public.cities drop constraint if exists cities_module_config_object;
alter table public.cities add constraint cities_module_config_object
  check (jsonb_typeof(module_config) = 'object');

update public.cities
set module_config = '{
  "calendar": true, "places": true, "community": true, "buddy": true,
  "marketplace": true, "housing": true, "jobs": true, "chat": true,
  "watcher": true, "settings": true, "offers": true
}'::jsonb,
brand_config = brand_config || '{
  "seoTitle": "StudentHub Brno – prakticky pro studenty",
  "seoDescription": "Ověřené termíny, místa, komunita a praktické služby pro studenty v Brně."
}'::jsonb,
updated_at = now()
where id = 'brno';

insert into public.cities (
  id, slug, name, region, country_code, timezone, latitude, longitude,
  map_bounds, map_zoom, enabled, public_status, sort_order, brand_config, module_config
) values (
  'olomouc', 'olomouc', 'Olomouc', 'Olomoucký kraj', 'CZ', 'Europe/Prague',
  49.593800, 17.250900, '[[49.535,17.185],[49.655,17.34]]'::jsonb, 13,
  false, 'draft', 40,
  '{
    "editionName": "StudentHub Olomouc",
    "editionShortName": "Olomouc",
    "seoTitle": "StudentHub Olomouc – připravujeme",
    "seoDescription": "Připravovaná městská edice StudentHubu pro studenty v Olomouci."
  }'::jsonb,
  '{
    "calendar": false, "places": false, "community": false, "buddy": false,
    "marketplace": false, "housing": false, "jobs": false, "chat": false,
    "watcher": false, "settings": false, "offers": false
  }'::jsonb
)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  region = excluded.region,
  country_code = excluded.country_code,
  timezone = excluded.timezone,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  map_bounds = excluded.map_bounds,
  map_zoom = excluded.map_zoom,
  sort_order = excluded.sort_order,
  brand_config = public.cities.brand_config || excluded.brand_config,
  updated_at = now();

insert into public.community_moderation_settings(city_id)
values ('olomouc') on conflict (city_id) do nothing;

create table if not exists public.city_configuration_audit (
  id bigint generated always as identity primary key,
  city_id text not null references public.cities(id) on update cascade on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('created','updated','enabled','disabled','published','unpublished')),
  previous_config jsonb not null default '{}'::jsonb check (jsonb_typeof(previous_config) = 'object'),
  new_config jsonb not null default '{}'::jsonb check (jsonb_typeof(new_config) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists city_configuration_audit_city_created_idx
  on public.city_configuration_audit(city_id, created_at desc);
alter table public.city_configuration_audit enable row level security;
drop policy if exists "superadmins read city configuration audit" on public.city_configuration_audit;
create policy "superadmins read city configuration audit" on public.city_configuration_audit
  for select to authenticated using (public.is_super_admin());
revoke all on public.city_configuration_audit from anon, authenticated;
grant select on public.city_configuration_audit to authenticated;
grant all on public.city_configuration_audit to service_role;
grant usage, select on sequence public.city_configuration_audit_id_seq to service_role;

-- Nové zápisy musí vždy určit město explicitně. Odstranění výchozího Brna
-- zabraňuje tichému zařazení olomouckého obsahu do brněnské edice.
alter table public.places alter column city_id drop default;
alter table public.community_profiles alter column city_id drop default;
alter table public.anonymous_installations alter column city_id drop default;
alter table public.marketplace_listings alter column city_id drop default;
alter table public.place_submissions alter column city_id drop default;
alter table public.housing_listings alter column city_id drop default;

create index if not exists community_posts_city_status_created_idx
  on public.community_posts(city_id, status, created_at desc);
create index if not exists buddy_posts_city_status_starts_idx
  on public.buddy_posts(city_id, status, starts_at);
create index if not exists marketplace_listings_city_status_published_idx
  on public.marketplace_listings(city_id, status, published_at desc);
create index if not exists housing_listings_city_status_published_idx
  on public.housing_listings(city_id, status, published_at desc);

drop policy if exists "public reads approved active buddy posts" on public.buddy_posts;
create policy "public reads approved active buddy posts" on public.buddy_posts
  for select to anon, authenticated using (
    moderation_status = 'approved' and status = 'active' and starts_at >= now() and expires_at >= now()
    and exists (select 1 from public.cities c where c.id = city_id and c.enabled and c.public_status = 'published')
  );

drop policy if exists "verified users request to join" on public.buddy_join_requests;
create policy "verified users request to join" on public.buddy_join_requests
  for insert to authenticated with check (
    requester_id = auth.uid() and public.is_verified_user()
    and exists (
      select 1 from public.buddy_posts p join public.cities c on c.id = p.city_id
      where p.id = post_id and p.owner_id <> auth.uid() and p.moderation_status = 'approved'
        and p.status = 'active' and p.expires_at >= now() and c.enabled and c.public_status = 'published'
    )
  );

drop policy if exists "public reads active community posts" on public.community_posts;
create policy "public reads active community posts" on public.community_posts
  for select to anon, authenticated using (
    status = 'active'
    and exists (select 1 from public.cities c where c.id = city_id and c.enabled and c.public_status = 'published')
  );

drop policy if exists "public reads active community comments" on public.community_comments;
create policy "public reads active community comments" on public.community_comments
  for select to anon, authenticated using (
    status = 'active' and exists (
      select 1 from public.community_posts p join public.cities c on c.id = p.city_id
      where p.id = post_id and p.status = 'active' and c.enabled and c.public_status = 'published'
    )
  );

drop policy if exists "public read active housing" on public.housing_listings;
create policy "public read active housing" on public.housing_listings
  for select to anon, authenticated using (
    status = 'active' and published_at is not null and expires_at > now()
    and exists (select 1 from public.cities c where c.id = city_id and c.enabled and c.public_status = 'published')
  );

drop policy if exists "public read active housing photos" on public.housing_photos;
create policy "public read active housing photos" on public.housing_photos
  for select to anon, authenticated using (
    exists (
      select 1 from public.housing_listings h join public.cities c on c.id = h.city_id
      where h.id = listing_id and h.status = 'active' and h.expires_at > now()
        and c.enabled and c.public_status = 'published'
    )
  );

comment on column public.cities.module_config is 'Per-city feature switches. A module is routable only when the city is published and this value is true.';
comment on table public.city_configuration_audit is 'Neveřejný audit změn městské konfigurace, modulů a publikace.';
