-- Vlastnictví ručních návrhů brigád a bezpečné návraty editovaného obsahu do moderace.
-- Hodnota content_status.deleted je zavedena v předchozí migraci, aby ji
-- PostgreSQL mohl bezpečně použít v policy a constraint definicích.
alter table public.submissions add column if not exists author_id uuid references public.profiles(id) on delete set null;
create index if not exists submissions_author_status_idx on public.submissions(author_id,status,created_at desc) where author_id is not null;

drop policy if exists "submission owners read" on public.submissions;
create policy "submission owners read" on public.submissions for select to authenticated
  using (author_id=auth.uid() or public.is_admin());
drop policy if exists "submission owners update" on public.submissions;
create policy "submission owners update" on public.submissions for update to authenticated
  using (author_id=auth.uid() and status in ('pending','rejected','approved','archived'))
  with check (author_id=auth.uid() and status in ('pending','archived','deleted'));

alter table public.marketplace_listings drop constraint if exists marketplace_listings_status_check;
alter table public.marketplace_listings add constraint marketplace_listings_status_check
  check (status in ('active','reserved','sold','archived','expired','hidden','deleted','rejected','pending_review'));
