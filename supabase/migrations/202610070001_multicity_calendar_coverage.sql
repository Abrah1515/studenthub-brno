-- Pokrytí akademických kalendářů všech aktivních fakult v publikovaných městech.
-- Migrace je doplňková a idempotentní; žádné události ani ruční změny nemaže.

alter table public.content_sources
  add column if not exists coverage_status text not null default 'needs_review',
  add column if not exists coverage_evidence text,
  add column if not exists organization_unit text,
  add column if not exists source_priority integer not null default 50,
  add column if not exists deep_discovery_interval interval not null default interval '7 days',
  add column if not exists last_event_count integer not null default 0;

alter table public.content_sources drop constraint if exists content_sources_coverage_status_check;
alter table public.content_sources add constraint content_sources_coverage_status_check check (
  coverage_status in ('complete','covered_by_central','partial','needs_review','blocked','unavailable','stale')
);
alter table public.content_sources drop constraint if exists content_sources_source_priority_check;
alter table public.content_sources add constraint content_sources_source_priority_check check (source_priority between 0 and 1000);
alter table public.content_sources drop constraint if exists content_sources_deep_discovery_interval_check;
alter table public.content_sources add constraint content_sources_deep_discovery_interval_check
  check (deep_discovery_interval between interval '1 day' and interval '30 days');
alter table public.content_sources drop constraint if exists content_sources_last_event_count_check;
alter table public.content_sources add constraint content_sources_last_event_count_check check (last_event_count >= 0);

-- Stabilní PDF smějí být kontrolována týdně; dynamické zdroje nadále mohou běžet denně.
alter table public.content_sources drop constraint if exists content_sources_refresh_interval_check;
alter table public.content_sources add constraint content_sources_refresh_interval_check
  check (refresh_interval between interval '1 hour' and interval '8 days');

update public.content_sources
set coverage_status = case
      when monitoring_mode = 'not_found_monitored' or sync_status = 'not_found' then 'unavailable'
      when monitoring_mode = 'automatic_publish' then 'complete'
      else 'needs_review'
    end,
    coverage_evidence = coalesce(coverage_evidence, nullif(terms_note, '')),
    source_priority = case when monitoring_mode = 'automatic_publish' then 100 else 60 end,
    deep_discovery_interval = interval '7 days'
where source_type = 'academic_calendar';

-- Praha: jedna bezpečně spravovaná řádka pro každou fakultu. Centrální zdroj je
-- použit jen tam, kde prokazatelně platí pro všechny fakulty dané školy.
with prague_source as (
  select f.id faculty_id, f.university_id,
    case f.id
      when 'cuni-ktf' then 'https://www.ktf.cuni.cz/KTF-2332.html'
      when 'cuni-etf' then 'https://web.etf.cuni.cz/ETFN-830.html'
      when 'cuni-htf' then 'https://htf.cuni.cz/HTF-125.html'
      when 'cuni-prf' then 'https://www.prf.cuni.cz/studium/harmonogram-akademickeho-roku'
      when 'cuni-lf1' then 'https://www.lf1.cuni.cz/harmonogram-ak-roku'
      when 'cuni-lf2' then 'https://www.lf2.cuni.cz/opatreni-dekana-c-52026'
      when 'cuni-lf3' then 'https://www.lf3.cuni.cz/3LF-2787.html'
      when 'cuni-ff' then 'https://www.ff.cuni.cz/fakulta/predpisy-a-dokumenty/opatreni-dekana/harmonogram/'
      when 'cuni-prirod' then 'https://natur.cuni.cz/fakulta/organizacni-struktura/organy-fakulty/dekan-a-kolegium/opatreni-dekana/opatreni-dekana-c-12-2026'
      when 'cuni-mff' then 'https://www.mff.cuni.cz/cs/studenti/harmonogram-ak-roku/predbezny-harmonogram-akademickeho-roku-2026-2027.pdf'
      when 'cuni-pedf' then 'https://pedf.cuni.cz/PEDF-71.html'
      when 'cuni-fsv' then 'https://fsv.cuni.cz/studium/prava-povinnosti-studenta/harmonogram-akademickeho-roku'
      when 'cuni-fhs' then 'https://fhs.cuni.cz/FHS-3919.html'
      when 'cuni-ftvs' then 'https://www.ftvs.cuni.cz/cs/studenti/informace-pro-studenty/harmonogram-akademickeho-roku'
      when 'cvut-fsv' then 'https://portal.fsv.cvut.cz/hlavni/akrok.php'
      when 'cvut-fs' then 'https://fs.cvut.cz/studium/bakalarske-a-magisterske/casovy-plan-ak-roku/'
      when 'cvut-fel' then 'https://intranet.fel.cvut.cz/cz/education/harmonogram2627'
      when 'cvut-fjfi' then 'https://fjfi.cvut.cz/cz/studium/harmonogram-roku-rozvrh/casovy-plan-akademickeho-roku'
      when 'cvut-fa' then 'https://www.fa.cvut.cz/cs/studium/obecne/harmonogram'
      when 'cvut-fd' then 'https://www.fd.cvut.cz/studium/harmonogram-akademickeho-roku'
      when 'cvut-fbmi' then 'https://www.fbmi.cvut.cz/cs/student/casovy-plan'
      when 'cvut-fit' then 'https://fit.cvut.cz/cs/studium/informacni-servis/harmonogram'
      when 'czu-pef' then 'https://www.pef.czu.cz/cs/r-7008-studium/r-10112-studijni-aktuality/harmonogram-zimniho-semestru.html'
      when 'czu-ftz' then 'https://www.ftz.czu.cz/cs/r-8683-aktuality-home/harmonogram-akademickeho-roku-2026-2027.html'
      else case f.university_id
        when 'vse' then 'https://www.vse.cz/studenti/studium/harmonogramy/'
        when 'czu' then 'https://www.czu.cz/dl/154159?lang=cs'
        when 'vscht' then 'https://studium.vscht.cz/organizace-roku-vyuky?jazyk=cs&lang=cs'
        else 'https://cuni.cz/UK-3952.html'
      end
    end source_url,
    case
      when f.id = 'cuni-mff' or (f.university_id = 'czu' and f.id not in ('czu-pef','czu-ftz')) then 'pdf'
      else 'html'
    end source_format,
    case
      when f.id = 'cuni-mff' or (f.university_id = 'czu' and f.id not in ('czu-pef','czu-ftz')) then 'pdfjs-academic-calendar'
      else 'generic-academic-html'
    end parser_key,
    case when f.id = 'cuni-pedf' or f.university_id in ('vse','vscht') or (f.university_id='czu' and f.id not in ('czu-pef','czu-ftz')) then 'covered_by_central' else 'complete' end coverage_status,
    case when f.id = 'cuni-pedf' or f.university_id in ('vse','vscht') or (f.university_id='czu' and f.id not in ('czu-pef','czu-ftz'))
      then 'Aktuální centrální oficiální harmonogram prokazatelně pokrývá tuto fakultu.'
      else 'Aktuální veřejný fakultní harmonogram pro akademický rok 2026/2027.' end coverage_evidence
  from public.faculties f where f.is_active and f.university_id in ('cuni','cvut','vse','czu','vscht')
)
insert into public.content_sources (
  id,university_id,faculty_id,city_id,source_type,source_url,official_domain,format,parser_key,
  enabled,refresh_interval,sync_status,confidence,requires_review,notes,terms_note,
  monitoring_mode,next_check_at,next_deep_discovery_at,discovery_status,coverage_status,
  coverage_evidence,source_priority,deep_discovery_interval
)
select 'src-' || faculty_id,university_id,faculty_id,'praha','academic_calendar',source_url,
  split_part(regexp_replace(lower(source_url), '^https://(www\.)?', ''), '/', 1),source_format,parser_key,
  true,case when source_format='pdf' then interval '7 days' else interval '48 hours' end,'idle',0.80,true,
  coverage_evidence,coverage_evidence,'automatic_review',now(),now(),'needs_review',coverage_status,
  coverage_evidence,case when coverage_status='complete' then 100 else 80 end,interval '7 days'
from prague_source
on conflict (faculty_id,source_type,source_url) do update set
  city_id=excluded.city_id,source_url=excluded.source_url,official_domain=excluded.official_domain,
  format=excluded.format,parser_key=excluded.parser_key,enabled=true,refresh_interval=excluded.refresh_interval,
  monitoring_mode=excluded.monitoring_mode,coverage_status=excluded.coverage_status,
  coverage_evidence=excluded.coverage_evidence,source_priority=excluded.source_priority,
  deep_discovery_interval=excluded.deep_discovery_interval,
  next_check_at=least(coalesce(public.content_sources.next_check_at,now()),now()),
  next_deep_discovery_at=least(coalesce(public.content_sources.next_deep_discovery_at,now()),now());

update public.content_sources set
  coverage_status='partial',
  coverage_evidence='Centrální harmonogram UK je doplňkový k aktuálním fakultním zdrojům.',
  source_priority=60,
  refresh_interval=interval '48 hours',
  deep_discovery_interval=interval '7 days'
where id='src-praha-cuni';

update public.content_sources set
  coverage_status='covered_by_central',
  coverage_evidence='Oficiální centrální harmonogram ČVUT 2026/2027.',
  source_priority=80,
  refresh_interval=interval '7 days',
  deep_discovery_interval=interval '7 days'
where id='src-praha-cvut';

update public.content_sources set
  coverage_status='complete',
  coverage_evidence='Oficiální fakultní časový plán FJFI ČVUT 2026/2027.',
  source_priority=100,
  refresh_interval=interval '7 days',
  deep_discovery_interval=interval '7 days'
where id='src-praha-cvut-fjfi';

-- VŠB-TUO: centrální harmonogram pokrývá všechny fakulty, tři fakulty mají
-- navíc vlastní aktuální veřejnou stránku. OU bez potvrzeného dokumentu zůstává
-- monitorovaná a nesmí generovat náhradní data.
with ostrava_source as (
  select f.id faculty_id,f.university_id,
    case f.id
      when 'vsbtuo-fei' then 'https://www.fei.vsb.cz/410/cs/studium/Harmonogramy-a-rozvrhy/'
      when 'vsbtuo-fast' then 'https://www.fast.vsb.cz/cs/student/harmonogram?academicYear=2026'
      when 'vsbtuo-fbi' then 'https://www.fbi.vsb.cz/cs/Student/harmonogram-akademickeho-roku/'
      when 'osu-ff' then 'https://ff.osu.cz/uredni-deska/'
      when 'osu-pdf' then 'https://pdf.osu.cz/uredni-deska/'
      when 'osu-fu' then 'https://fu.osu.cz/uredni-deska/'
      when 'osu-lf' then 'https://lf.osu.cz/uredni-deska/'
      else 'https://www.vsb.cz/cs/student/harmonogram/?academicYear=2026'
    end source_url,
    case when f.university_id='osu' then 'unavailable' when f.id in ('vsbtuo-fei','vsbtuo-fast','vsbtuo-fbi') then 'complete' else 'covered_by_central' end coverage_status,
    case when f.university_id='osu'
      then 'Aktuální veřejný harmonogram 2026/2027 nebyl potvrzen; oficiální fakultní úřední deska zůstává monitorovaná.'
      when f.id in ('vsbtuo-fei','vsbtuo-fast','vsbtuo-fbi') then 'Aktuální veřejný fakultní harmonogram VŠB-TUO.'
      else 'Centrální harmonogram VŠB-TUO 2026/2027 prokazatelně pokrývá tuto fakultu.' end coverage_evidence
  from public.faculties f
  where f.is_active and ((f.university_id='vsbtuo' and f.id<>'vsbtuo-hgf') or (f.university_id='osu' and f.id not in ('osu-prf','osu-fss')))
)
insert into public.content_sources (
  id,university_id,faculty_id,city_id,source_type,source_url,official_domain,format,parser_key,
  enabled,refresh_interval,sync_status,confidence,requires_review,notes,terms_note,
  monitoring_mode,next_check_at,next_deep_discovery_at,discovery_status,coverage_status,
  coverage_evidence,source_priority,deep_discovery_interval
)
select 'src-' || faculty_id,university_id,faculty_id,'ostrava','academic_calendar',source_url,
  split_part(regexp_replace(lower(source_url), '^https://(www\.)?', ''), '/', 1),'html',
  case when coverage_status='unavailable' then 'not-found-monitor' else 'generic-academic-html' end,
  true,case when coverage_status='unavailable' then interval '7 days' else interval '48 hours' end,
  case when coverage_status='unavailable' then 'not_found' else 'idle' end,
  case when coverage_status='unavailable' then 0 else 0.80 end,true,coverage_evidence,coverage_evidence,
  case when coverage_status='unavailable' then 'not_found_monitored' else 'automatic_review' end,
  now(),now(),'needs_review',coverage_status,coverage_evidence,
  case when coverage_status='complete' then 100 when coverage_status='covered_by_central' then 80 else 20 end,
  interval '7 days'
from ostrava_source
on conflict (faculty_id,source_type,source_url) do update set
  city_id=excluded.city_id,source_url=excluded.source_url,official_domain=excluded.official_domain,
  format=excluded.format,parser_key=excluded.parser_key,enabled=true,refresh_interval=excluded.refresh_interval,
  monitoring_mode=excluded.monitoring_mode,coverage_status=excluded.coverage_status,
  coverage_evidence=excluded.coverage_evidence,source_priority=excluded.source_priority,
  deep_discovery_interval=excluded.deep_discovery_interval,
  next_check_at=least(coalesce(public.content_sources.next_check_at,now()),now()),
  next_deep_discovery_at=least(coalesce(public.content_sources.next_deep_discovery_at,now()),now());

update public.content_sources set
  monitoring_mode='not_found_monitored',
  parser_key='not-found-monitor',
  sync_status='not_found',
  confidence=0,
  requires_review=true,
  coverage_status='unavailable',
  source_priority=20,
  refresh_interval=interval '7 days'
where faculty_id in ('osu-ff','osu-pdf','osu-fu','osu-lf')
  and source_type='academic_calendar';

update public.content_sources set
  coverage_status='covered_by_central',
  coverage_evidence='Centrální harmonogram VŠB-TUO 2026/2027 prokazatelně pokrývá HGF.',
  source_priority=80,
  refresh_interval=interval '48 hours',
  deep_discovery_interval=interval '7 days'
where id='src-ostrava-vsbtuo';

update public.content_sources set
  coverage_status='complete',
  coverage_evidence='Aktuální oficiální fakultní PDF harmonogram 2026/2027.',
  source_priority=100,
  refresh_interval=interval '7 days',
  deep_discovery_interval=interval '7 days'
where id in ('src-ostrava-osu-prf','src-ostrava-osu-fss');

create index if not exists content_sources_coverage_idx
  on public.content_sources(city_id,university_id,coverage_status,faculty_id)
  where source_type='academic_calendar';

-- Starý proces po pádu nesmí trvale držet lease. Obnova probíhá atomicky před
-- každým přidělením další dávky a nemění žádná publikovaná data.
create or replace function public.claim_due_content_sources(batch_size integer default 3)
returns table(source_id text)
language plpgsql security definer set search_path = '' as $$
begin
  update public.source_sync_runs
  set status='failed',finished_at=now(),error_message=coalesce(error_message,'Běh překročil 30minutový lease a byl bezpečně uvolněn.')
  where status='running' and started_at < now() - interval '30 minutes';

  update public.content_sources
  set sync_status='failed',next_retry_at=now(),last_error_at=now(),
      last_error_message='Předchozí synchronizace překročila 30minutový lease.'
  where sync_status='running' and last_checked_at < now() - interval '30 minutes';

  return query
  with due as (
    select s.id from public.content_sources s
    where s.enabled and coalesce(s.next_retry_at,s.next_check_at,now()) <= now()
      and (s.sync_status <> 'running' or s.last_checked_at < now() - interval '30 minutes')
    order by coalesce(s.next_retry_at,s.next_check_at,now()),s.source_priority desc,s.id
    for update skip locked limit greatest(1,least(batch_size,10))
  ), claimed as (
    update public.content_sources s set sync_status='running',last_checked_at=now(),next_retry_at=null
    from due where s.id=due.id returning s.id
  ) select claimed.id from claimed;
end;
$$;
revoke all on function public.claim_due_content_sources(integer) from public,anon,authenticated;
grant execute on function public.claim_due_content_sources(integer) to service_role;

comment on column public.content_sources.coverage_status is 'Jednoznačný stav pokrytí aktivní fakulty oficiálním akademickým zdrojem.';
comment on column public.content_sources.coverage_evidence is 'Důkaz nebo bezpečné vysvětlení stavu pokrytí; neobsahuje neveřejná data.';
