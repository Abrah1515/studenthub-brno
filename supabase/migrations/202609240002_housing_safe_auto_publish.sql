-- Bezpečné automatické zveřejnění uživatelského bydlení.
-- Migrace je forward-only a staré čekající položky přehodnotí konzervativně a idempotentně.

alter table public.housing_listings add column if not exists moderation_reason text;
alter table public.housing_listings add column if not exists publication_mode text;
alter table public.housing_listings add column if not exists auto_evaluated_at timestamptz;

alter table public.housing_history drop constraint if exists housing_history_event_type_check;
alter table public.housing_history add constraint housing_history_event_type_check
  check (event_type in ('created','updated','submitted_review','approved','rejected','hidden','archived','restored','occupied','found','renewed','expired','deleted','reported','contacted'));

alter table public.housing_listings drop constraint if exists housing_listings_moderation_reason_check;
alter table public.housing_listings add constraint housing_listings_moderation_reason_check
  check (moderation_reason is null or moderation_reason ~ '^[a-z0-9_]{2,80}$') not valid;
alter table public.housing_listings validate constraint housing_listings_moderation_reason_check;

alter table public.housing_listings drop constraint if exists housing_listings_publication_mode_check;
alter table public.housing_listings add constraint housing_listings_publication_mode_check
  check (publication_mode is null or publication_mode in ('automatic','manual'));

create index if not exists housing_moderation_queue_idx
  on public.housing_listings(city_id,status,moderation_reason,created_at desc)
  where status in ('pending_review','hidden','rejected');

create or replace function public.reassess_pending_housing_listings()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare affected integer;
begin
  with safe_candidates as (
    select h.id,h.status
    from public.housing_listings h
    where h.status='pending_review'
      and public.is_profile_ready(h.author_id)
      and not exists (
        select 1 from public.profile_reports r
        where r.reported_id=h.author_id and r.status in ('new','reviewed')
      )
      and not exists (
        select 1 from public.housing_listings other
        where other.author_id=h.author_id and other.duplicate_fingerprint=h.duplicate_fingerprint
          and other.id<>h.id and other.status in ('active','hidden')
      )
      and (h.listing_type='wanted' or exists(select 1 from public.housing_photos p where p.listing_id=h.id))
      and concat_ws(E'\n',h.title,h.locality,h.short_description,h.description,h.transit_access) !~* '<\/?[a-z][^>]*>|on[a-z]+\s*=|javascript\s*:|data\s*:\s*text/html'
      and concat_ws(E'\n',h.title,h.locality,h.short_description,h.description,h.transit_access) !~* '(javascript|data|file)\s*:|https?://(localhost|127\.0\.0\.1|\[?::1\]?|bit\.ly|tinyurl\.com|t\.co|rb\.gy)'
      and concat_ws(E'\n',h.title,h.locality,h.short_description,h.description,h.transit_access) !~* 'https?://|www\.|t\.me/|wa\.me/'
      and concat_ws(E'\n',h.title,h.locality,h.short_description,h.description,h.transit_access) !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}|(\+?420[ .-]*)?([0-9][ .-]?){9}'
      and concat_ws(E'\n',h.title,h.locality,h.short_description,h.description,h.transit_access) !~* '(ulice|ul\.?|adresa|bytem|náměstí|nám\.?|třída|tř\.?).{2,60}[0-9]{1,4}(/[0-9]{1,4})?'
      and lower(translate(concat_ws(E'\n',h.title,h.short_description,h.description),'áčďéěíňóřšťúůýž','acdeeinorstuuyz')) !~ '(posli|zaplat|uhrad|preved).{0,30}(zaloh|kauci|rezervacni poplatek).{0,35}(predem|bez prohlidky|hned)'
      and lower(translate(concat_ws(E'\n',h.title,h.short_description,h.description),'áčďéěíňóřšťúůýž','acdeeinorstuuyz')) !~ '(jen|pouze|nechci).{0,18}(zeny|muze|cizince|cechy|slovaky|romy|krestany|muslimy)'
      and lower(translate(concat_ws(E'\n',h.title,h.short_description,h.description),'áčďéěíňóřšťúůýž','acdeeinorstuuyz')) !~ '(drogy|zbrane|sex za najem|sexualni sluzb)'
      and (h.deposit_amount is null or h.deposit_amount<=greatest(3*h.price_monthly,100000))
    for update skip locked
  ), changed as (
    update public.housing_listings h
      set status='active', published_at=coalesce(h.published_at,now()), publication_mode='automatic',
          moderation_flags='{}', moderation_reason='safe_rules_passed', auto_evaluated_at=now(), version=h.version+1
    from safe_candidates c where h.id=c.id
    returning h.id,c.status
  )
  insert into public.housing_history(listing_id,event_type,previous_status,new_status,changes)
    select id,'approved',status,'active',jsonb_build_object('reason','safe_pending_reassessment','publication_mode','automatic') from changed;
  get diagnostics affected=row_count;

  update public.housing_listings
    set moderation_reason=coalesce(moderation_reason,moderation_flags[1],'legacy_pending_needs_review'),auto_evaluated_at=coalesce(auto_evaluated_at,now())
  where status='pending_review' and moderation_reason is null;
  return affected;
end $$;

revoke all on function public.reassess_pending_housing_listings() from public,anon,authenticated;
grant execute on function public.reassess_pending_housing_listings() to service_role;

-- Jednorázové přehodnocení při aplikaci migrace; další spuštění je bezpečně idempotentní.
select public.reassess_pending_housing_listings();
