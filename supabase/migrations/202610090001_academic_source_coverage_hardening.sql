-- Zpřesnění aktuálních akademických zdrojů a funkčního pokrytí OU.
-- Migrace je idempotentní a nemaže ručně spravované termíny.

insert into public.content_sources
  (id,university_id,faculty_id,city_id,source_type,source_url,official_domain,format,parser_key,enabled,
   refresh_interval,sync_status,terms_note,academic_year,confidence,requires_review,notes,source_document_title,
   monitoring_mode,next_check_at,coverage_status,coverage_evidence,source_priority,deep_discovery_interval)
values
  ('src-brno-mendelu-central','mendelu','mendelu-af','brno','academic_calendar',
   'https://mendelu.cz/o-univerzite/uredni-deska/zakladni-dokumenty-souvisejici-se-studiem/',
   'mendelu.cz','html','linked-document-review',true,interval '7 days','manual_review',
   'Oficiální centrální rozcestník MENDELU; dokumentový server se kontroluje jen v souladu s robots.txt.',
   '2026/2027',0.90,true,'Fakultní harmonogramy zůstávají nad společným univerzitním základem.',
   'Nařízení rektora č. 8/2026 – Harmonogram akademického roku 2026/2027',
   'automatic_review',now(),'covered_by_central',
   'Nařízení rektora MENDELU č. 8/2026 potvrzuje společný akademický rok 2026/2027.',80,interval '7 days')
on conflict (id) do update set
  source_url=excluded.source_url,official_domain=excluded.official_domain,format=excluded.format,
  parser_key=excluded.parser_key,enabled=true,refresh_interval=excluded.refresh_interval,
  terms_note=excluded.terms_note,academic_year=excluded.academic_year,confidence=excluded.confidence,
  requires_review=true,notes=excluded.notes,source_document_title=excluded.source_document_title,
  monitoring_mode='automatic_review',coverage_status='covered_by_central',
  coverage_evidence=excluded.coverage_evidence,source_priority=excluded.source_priority,
  deep_discovery_interval=excluded.deep_discovery_interval,next_check_at=least(public.content_sources.next_check_at,now());

insert into public.academic_events
  (id,title,description,category,school,faculty,starts_at,ends_at,source_name,source_url,source_updated_at,status,is_demo,
   external_id,source_id,all_day,timezone,academic_year,source_hash,confidence,last_verified_at,verification_status,change_state,
   is_cancelled,manual_override,duplicate_fingerprint,scope_type,university_id,faculty_id,city_id,source_document_title,semester)
values
  ('76000000-0000-4000-8000-000000000001','Akademický rok 2026/2027 na MENDELU',
   'Společný rámec akademického roku podle aktuálního nařízení rektora MENDELU; konkrétní výuku, zkoušky a registrace doplňují fakultní harmonogramy.',
   'other','MENDELU','Všechny fakulty','2026-09-01 00:00:00+02','2027-08-31 23:59:59+02',
   'Oficiální dokumenty MENDELU','https://mendelu.cz/o-univerzite/uredni-deska/zakladni-dokumenty-souvisejici-se-studiem/',
   '2026-10-06 00:00:00+02','approved',false,'mendelu-academic-year-2026','src-brno-mendelu-central',true,
   'Europe/Prague','2026/2027',md5('mendelu-academic-year-2026')||md5('source'),0.95,
   '2026-10-09 00:00:00+02','verified','unchanged',false,false,
   md5('mendelu-academic-year-2026')||md5('event'),'university','mendelu',null,'brno',
   'Nařízení rektora č. 8/2026 – Harmonogram akademického roku 2026/2027','year_round')
on conflict (id) do update set
  title=excluded.title,description=excluded.description,source_url=excluded.source_url,
  last_verified_at=excluded.last_verified_at,verification_status='verified',status='approved',is_cancelled=false,
  academic_year='2026/2027',scope_type='university',city_id='brno',university_id='mendelu',faculty_id=null,
  source_id='src-brno-mendelu-central';

update public.content_sources set
  source_url='https://www.ktf.cuni.cz/KTF-2332.html',
  official_domain='www.ktf.cuni.cz',format='html',parser_key='generic-academic-html',
  academic_year='2026/2027',coverage_status='complete',
  coverage_evidence='Aktuální fakultní harmonogram KTF UK 2026/2027.',
  next_check_at=now()
where id='src-cuni-ktf';

update public.content_sources set
  source_url='https://web.prf.cuni.cz/magisterske-studium/harmonogram-akademickeho-roku',
  official_domain='web.prf.cuni.cz',format='html',parser_key='generic-academic-html',
  academic_year='2026/2027',coverage_status='complete',
  coverage_evidence='Aktuální fakultní harmonogram PrF UK 2026/2027.',
  next_check_at=now()
where id='src-cuni-prf';

update public.content_sources set
  source_url='https://www.fd.cvut.cz/studium/harmonogram-akademickeho-roku',
  official_domain='www.fd.cvut.cz',format='html',parser_key='generic-academic-html',
  academic_year='2026/2027',coverage_status='complete',
  coverage_evidence='Aktuální harmonogram FD ČVUT 2026/2027.',
  next_check_at=now()
where id='src-cvut-fd';

update public.content_sources set
  source_url='https://www.fei.vsb.cz/cs-old/studium/harmonogramy-a-rozvrhy/',
  official_domain='www.fei.vsb.cz',format='html',parser_key='generic-academic-html',
  academic_year='2026/2027',monitoring_mode='automatic_publish',requires_review=false,
  coverage_status='complete',coverage_evidence='Strukturovaný fakultní harmonogram FEI VŠB-TUO 2026/2027.',
  next_check_at=now()
where id='src-vsbtuo-fei';

update public.content_sources set
  source_url='https://www.upol.cz/studenti/studium/harmonogram-akademickeho-roku/',
  official_domain='www.upol.cz',format='html',parser_key='upol-academic-html',
  academic_year='2026/2027',monitoring_mode='automatic_publish',requires_review=false,
  coverage_status='covered_by_central',
  coverage_evidence='Strukturovaný centrální harmonogram UP 2026/2027 obsahuje společné i fakultně rozlišené termíny.',
  refresh_interval=interval '24 hours',next_check_at=now()
where id in ('src-upol-cmtf','src-upol-lf','src-upol-ff','src-upol-prf','src-upol-pdf','src-upol-ftk','src-upol-pf','src-upol-fzv');

with osu_sources(id,url,evidence) as (values
  ('src-osu-ff','https://dokumenty.osu.cz/ff/uredni-deska/ff-harmonogram-ar-2026-2027.pdf','Oficiální fakultní PDF harmonogram FF OU 2026/2027.'),
  ('src-osu-pdf','https://dokumenty.osu.cz/pdf/urednideska/pdf-harmonogram-ar-2026-2027.pdf','Oficiální fakultní PDF harmonogram PdF OU 2026/2027.'),
  ('src-osu-fu','https://dokumenty.osu.cz/fu/urednideska/fu-harmonogram-ar-2026-2027.pdf','Oficiální fakultní PDF harmonogram FU OU 2026/2027.'),
  ('src-osu-lf','https://dokumenty.osu.cz/lf/urednideska/lf-harmonogram-ar-2026-2027.pdf','Oficiální fakultní PDF harmonogram LF OU 2026/2027.')
)
update public.content_sources s set
  source_url=o.url,official_domain='dokumenty.osu.cz',format='pdf',parser_key='pdfjs-academic-calendar',
  academic_year='2026/2027',monitoring_mode='automatic_review',requires_review=true,
  sync_status='manual_review',coverage_status='complete',coverage_evidence=o.evidence,
  terms_note=o.evidence||' Server zdroje vyžaduje bezpečnou ruční kontrolu.',
  refresh_interval=interval '7 days',next_check_at=now()+interval '7 days'
from osu_sources o where s.id=o.id;

insert into public.content_sources
  (id,university_id,faculty_id,city_id,source_type,source_url,official_domain,format,parser_key,enabled,
   refresh_interval,sync_status,terms_note,academic_year,confidence,requires_review,notes,source_document_title,
   monitoring_mode,next_check_at,coverage_status,coverage_evidence,source_priority,deep_discovery_interval)
values
  ('src-ostrava-osu','osu','osu-ff','ostrava','academic_calendar',
   'https://dokumenty.osu.cz/osu/uredni-deska/ou-harmonogram-akademickeho-roku-2026-2027.pdf',
   'dokumenty.osu.cz','pdf','pdfjs-academic-calendar',true,interval '7 days','manual_review',
   'Oficiální centrální PDF OU 2026/2027; automat nesmí obcházet neplatnou odpověď robots.txt.',
   '2026/2027',0.98,true,'Společné ověřené termíny jsou publikované idempotentní migrací.',
   'Harmonogram akademického roku 2026/2027','automatic_review',now()+interval '7 days',
   'covered_by_central','Centrální harmonogram OU poskytuje společný základ všem fakultám.',90,interval '7 days')
on conflict (id) do update set
  source_url=excluded.source_url,official_domain=excluded.official_domain,format=excluded.format,
  parser_key=excluded.parser_key,enabled=true,refresh_interval=excluded.refresh_interval,
  terms_note=excluded.terms_note,academic_year=excluded.academic_year,confidence=excluded.confidence,
  requires_review=true,notes=excluded.notes,source_document_title=excluded.source_document_title,
  monitoring_mode='automatic_review',coverage_status='covered_by_central',
  coverage_evidence=excluded.coverage_evidence,source_priority=excluded.source_priority,
  deep_discovery_interval=excluded.deep_discovery_interval;

with source_data(external_id,title,description,category,starts_at,ends_at,semester) as (values
  ('osu-central-christmas-break-2026','Vánoční prázdniny na OU','Společné zimní prázdniny podle centrálního harmonogramu OU.','holiday'::public.event_category,'2026-12-24 00:00:00+01'::timestamptz,'2027-01-03 23:59:59+01'::timestamptz,'autumn'),
  ('osu-central-winter-exams-2027','Zimní zkouškové období OU','Společné zkouškové období podle centrálního harmonogramu OU.','exam','2027-01-04 00:00:00+01','2027-02-12 23:59:59+01','autumn'),
  ('osu-central-final-exams-winter-2027','Státní závěrečné zkoušky OU – zimní období','Období státních závěrečných zkoušek podle centrálního harmonogramu OU.','exam','2027-01-04 00:00:00+01','2027-02-12 23:59:59+01','autumn'),
  ('osu-central-summer-registration-2027','Zápis předmětů na letní semestr OU','Společný termín zápisu předmětů podle centrálního harmonogramu OU.','registration','2027-01-26 00:00:00+01','2027-01-31 23:59:59+01','spring'),
  ('osu-central-summer-teaching-start-2027','Začátek výuky v letním semestru OU','Začátek výuky podle centrálního harmonogramu OU.','teaching','2027-02-15 00:00:00+01','2027-02-15 23:59:59+01','spring'),
  ('osu-central-easter-break-2027','Velikonoční prázdniny na OU','Společné velikonoční prázdniny podle centrálního harmonogramu OU.','holiday','2027-03-25 00:00:00+01','2027-03-29 23:59:59+02','spring'),
  ('osu-central-summer-break-2027','Hlavní letní prázdniny na OU','Společné hlavní prázdniny podle centrálního harmonogramu OU.','holiday','2027-07-01 00:00:00+02','2027-08-31 23:59:59+02','year_round'),
  ('osu-central-final-exams-august-2027','Státní závěrečné zkoušky OU – srpnový termín','Srpnové období státních závěrečných zkoušek podle centrálního harmonogramu OU.','exam','2027-08-02 00:00:00+02','2027-08-27 23:59:59+02','year_round')
), prepared as (
  select s.*,('75'||substr(md5(external_id),1,6)||'-'||substr(md5(external_id),7,4)||'-4'||substr(md5(external_id),11,3)||'-8'||substr(md5(external_id),14,3)||'-'||substr(md5(external_id),17,12))::uuid id
  from source_data s
)
insert into public.academic_events
  (id,title,description,category,school,faculty,starts_at,ends_at,source_name,source_url,source_updated_at,status,is_demo,
   external_id,source_id,all_day,timezone,academic_year,source_hash,confidence,last_verified_at,verification_status,change_state,
   is_cancelled,manual_override,duplicate_fingerprint,scope_type,university_id,faculty_id,city_id,source_document_title,semester)
select id,title,description,category,'OU','Všechny fakulty',starts_at,ends_at,'Oficiální harmonogram OU',
  'https://dokumenty.osu.cz/osu/uredni-deska/ou-harmonogram-akademickeho-roku-2026-2027.pdf',
  '2026-10-09 00:00:00+02','approved',false,external_id,'src-ostrava-osu',true,'Europe/Prague','2026/2027',
  md5(external_id)||md5(external_id||'source'),0.98,'2026-10-09 00:00:00+02','verified','unchanged',false,false,
  md5(external_id)||md5(external_id||'event'),'university','osu',null,'ostrava','Harmonogram akademického roku 2026/2027',semester
from prepared
on conflict (id) do update set
  title=excluded.title,description=excluded.description,category=excluded.category,starts_at=excluded.starts_at,
  ends_at=excluded.ends_at,source_url=excluded.source_url,last_verified_at=excluded.last_verified_at,
  verification_status='verified',status='approved',is_cancelled=false,academic_year='2026/2027',
  scope_type='university',city_id='ostrava',university_id='osu',faculty_id=null,source_id='src-ostrava-osu';

-- Fakultní PřF záznamy se stejným rozsahem nahrazuje společný termín. Unikátní
-- fakultní termíny zůstávají beze změny.
update public.academic_events set status='archived',archived_at=now()
where source_id='src-ostrava-osu-prf'
  and external_id in ('osu-prf-christmas-break-2026','osu-prf-winter-exams-2027','osu-prf-easter-break-2027')
  and manual_override=false;
