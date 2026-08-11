-- The semantic fingerprint deliberately ignores dates so changed schedules can be
-- compared across official sources. Multiple legitimate occurrences with the same
-- title/category remain distinct by their actual start and end timestamps.
drop index if exists public.academic_events_dedupe_idx;
create unique index academic_events_dedupe_idx
  on public.academic_events(
    duplicate_fingerprint,
    academic_year,
    starts_at,
    (coalesce(ends_at, starts_at))
  )
  where duplicate_fingerprint is not null and status <> 'archived';
