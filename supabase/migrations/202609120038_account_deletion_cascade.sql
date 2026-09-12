-- Deleting an authenticated user must not be blocked by user-owned place or
-- housing rows. Media paths are collected and removed server-side before/after
-- auth deletion; relational children are removed transactionally by Postgres.

alter table public.place_submissions drop constraint if exists place_submissions_author_id_fkey;
alter table public.place_submissions
  add constraint place_submissions_author_id_fkey foreign key (author_id)
  references public.profiles(id) on delete cascade;

alter table public.place_comments drop constraint if exists place_comments_author_id_fkey;
alter table public.place_comments
  add constraint place_comments_author_id_fkey foreign key (author_id)
  references public.profiles(id) on delete cascade;

alter table public.housing_listings drop constraint if exists housing_listings_author_id_fkey;
alter table public.housing_listings
  add constraint housing_listings_author_id_fkey foreign key (author_id)
  references public.profiles(id) on delete cascade;

alter table public.housing_reports drop constraint if exists housing_reports_listing_id_fkey;
alter table public.housing_reports
  add constraint housing_reports_listing_id_fkey foreign key (listing_id)
  references public.housing_listings(id) on delete cascade;

alter table public.housing_history drop constraint if exists housing_history_listing_id_fkey;
alter table public.housing_history
  add constraint housing_history_listing_id_fkey foreign key (listing_id)
  references public.housing_listings(id) on delete cascade;

comment on constraint place_submissions_author_id_fkey on public.place_submissions is
  'User-owned unpublished place proposals are removed with the profile.';
comment on constraint place_comments_author_id_fkey on public.place_comments is
  'User-authored place experiences are removed with the profile.';
comment on constraint housing_listings_author_id_fkey on public.housing_listings is
  'Housing listings and relational children are removed with the profile.';
