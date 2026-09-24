-- Rozšíření správy vlastního obsahu bez změny veřejných práv.
alter table public.buddy_posts add column if not exists title text;
update public.buddy_posts
set title = case activity_type
  when 'beer' then 'Posezení u piva' when 'cinema' then 'Společně do kina'
  when 'sport' then 'Sportovní aktivita' when 'culture' then 'Kulturní akce'
  when 'study' then 'Společné učení' else 'Společný výlet' end
where title is null;
alter table public.buddy_posts alter column title set not null;
alter table public.buddy_posts drop constraint if exists buddy_posts_title_length;
alter table public.buddy_posts add constraint buddy_posts_title_length check (char_length(title) between 4 and 120) not valid;
alter table public.buddy_posts validate constraint buddy_posts_title_length;
alter table public.buddy_posts drop constraint if exists buddy_posts_status_check;
alter table public.buddy_posts add constraint buddy_posts_status_check check (status in ('active','arranged','closed','archived','expired','deleted'));

alter table public.marketplace_listings drop constraint if exists marketplace_listings_status_check;
alter table public.marketplace_listings add constraint marketplace_listings_status_check
  check (status in ('active','reserved','sold','archived','expired','hidden','deleted','rejected'));

alter table public.housing_listings drop constraint if exists housing_listings_status_check;
alter table public.housing_listings add constraint housing_listings_status_check
  check (status in ('active','pending_review','hidden','occupied','found','archived','expired','rejected','deleted'));
