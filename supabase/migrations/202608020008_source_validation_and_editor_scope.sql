-- Produkční validace zdrojů a úplný rozsah městských editorů.

alter table public.content_sources add column if not exists last_final_url text check (last_final_url is null or last_final_url ~ '^https://');
alter table public.content_sources add column if not exists last_content_type text;
alter table public.content_sources add column if not exists last_block_reason text;

alter table public.link_checks add column if not exists content_type text;
alter table public.link_checks add column if not exists expected_content_type text;
alter table public.link_checks add column if not exists detected_academic_year text;
alter table public.link_checks add column if not exists expected_academic_year text;
alter table public.link_checks add column if not exists validation_message text;
alter table public.link_checks drop constraint if exists link_checks_status_check;
alter table public.link_checks add constraint link_checks_status_check
  check (status in ('ok','redirect','redirected','blocked','needs_review','temporary_failure','broken','skipped'));

-- Městský administrátor smí spravovat i univerzitní/fakultní termíny bez city_id,
-- pokud je univerzita přiřazená jeho městu. Fakultní editor zůstává omezen vlastní fakultou.
drop policy if exists "city staff manage university events" on public.academic_events;
create policy "city staff manage university events" on public.academic_events for all to authenticated
using (
  city_id is null and university_id is not null and exists (
    select 1 from public.university_cities uc
    where uc.university_id = academic_events.university_id and public.can_manage_city(uc.city_id)
  )
)
with check (
  city_id is null and university_id is not null and exists (
    select 1 from public.university_cities uc
    where uc.university_id = academic_events.university_id and public.can_manage_city(uc.city_id)
  )
);

create index if not exists content_sources_validation_state_idx
  on public.content_sources(sync_status, last_checked_at)
  where requires_review = true;

-- Supabase obvykle přiděluje oprávnění přes výchozí granty projektu. Migrace je
-- uvádí explicitně, aby RLS fungovalo stejně i na čisté PostgreSQL instanci.
-- Samotný přístup k řádkům nadále omezuje výhradně aplikované RLS politiky.
grant select, insert, update, delete on public.academic_events to authenticated;
grant select, insert, update, delete on public.places, public.offers, public.jobs, public.submissions to authenticated;
grant select, update on public.service_requests to authenticated;
