-- Produkční aktivace Ostravy nad společnou multi-city architekturou.
-- Pouze ověřené zdroje pro akademický rok 2026/2027 a idempotentní upserty.

insert into public.cities (
  id,slug,name,region,country_code,timezone,latitude,longitude,map_bounds,map_zoom,
  enabled,public_status,sort_order,brand_config,module_config
) values (
  'ostrava','ostrava','Ostrava','Moravskoslezský kraj','CZ','Europe/Prague',49.820900,18.262500,
  '[[49.72,18.08],[49.91,18.38]]'::jsonb,12,true,'published',30,
  '{"editionName":"StudentHub Ostrava","editionShortName":"Ostrava","seoTitle":"StudentHub Ostrava – prakticky pro studenty","seoDescription":"Ověřené termíny, místa, komunita a praktické služby pro studenty v Ostravě."}'::jsonb,
  '{"calendar":true,"places":true,"community":true,"buddy":true,"marketplace":true,"housing":true,"jobs":true,"chat":true,"watcher":true,"settings":true,"offers":false}'::jsonb
) on conflict (id) do update set
  slug=excluded.slug,name=excluded.name,region=excluded.region,country_code=excluded.country_code,
  timezone=excluded.timezone,latitude=excluded.latitude,longitude=excluded.longitude,map_bounds=excluded.map_bounds,
  map_zoom=excluded.map_zoom,enabled=true,public_status='published',sort_order=excluded.sort_order,
  brand_config=excluded.brand_config,module_config=excluded.module_config,updated_at=now();

insert into public.community_moderation_settings(city_id)
values ('ostrava') on conflict (city_id) do nothing;

insert into public.universities (id,slug,name,short_name,city,website_url,is_active,last_verified_at) values
('vsbtuo','vsbtuo','Vysoká škola báňská – Technická univerzita Ostrava','VŠB-TUO','Ostrava','https://www.vsb.cz/',true,'2026-10-04 00:00:00+02'),
('osu','osu','Ostravská univerzita','OU','Ostrava','https://www.osu.cz/',true,'2026-10-04 00:00:00+02')
on conflict (id) do update set slug=excluded.slug,name=excluded.name,short_name=excluded.short_name,city='Ostrava',
  website_url=excluded.website_url,is_active=true,last_verified_at=excluded.last_verified_at;

insert into public.university_cities(university_id,city_id,is_primary) values
('vsbtuo','ostrava',true),('osu','ostrava',true)
on conflict (university_id,city_id) do update set is_primary=true;

insert into public.faculties(id,university_id,slug,name,short_name,official_url,is_active,last_verified_at) values
('vsbtuo-hgf','vsbtuo','vsbtuo-hgf','Hornicko-geologická fakulta','HGF','https://www.hgf.vsb.cz/',true,'2026-10-04'),
('vsbtuo-fmt','vsbtuo','vsbtuo-fmt','Fakulta materiálově-technologická','FMT','https://www.fmt.vsb.cz/',true,'2026-10-04'),
('vsbtuo-fs','vsbtuo','vsbtuo-fs','Fakulta strojní','FS','https://www.fs.vsb.cz/',true,'2026-10-04'),
('vsbtuo-ekf','vsbtuo','vsbtuo-ekf','Ekonomická fakulta','EKF','https://www.ekf.vsb.cz/',true,'2026-10-04'),
('vsbtuo-fei','vsbtuo','vsbtuo-fei','Fakulta elektrotechniky a informatiky','FEI','https://www.fei.vsb.cz/',true,'2026-10-04'),
('vsbtuo-fast','vsbtuo','vsbtuo-fast','Fakulta stavební','FAST','https://www.fast.vsb.cz/',true,'2026-10-04'),
('vsbtuo-fbi','vsbtuo','vsbtuo-fbi','Fakulta bezpečnostního inženýrství','FBI','https://www.fbi.vsb.cz/',true,'2026-10-04'),
('osu-ff','osu','osu-ff','Filozofická fakulta','FF','https://ff.osu.cz/',true,'2026-10-04'),
('osu-pdf','osu','osu-pdf','Pedagogická fakulta','PdF','https://pdf.osu.cz/',true,'2026-10-04'),
('osu-prf','osu','osu-prf','Přírodovědecká fakulta','PřF','https://prf.osu.cz/',true,'2026-10-04'),
('osu-fu','osu','osu-fu','Fakulta umění','FU','https://fu.osu.cz/',true,'2026-10-04'),
('osu-lf','osu','osu-lf','Lékařská fakulta','LF','https://lf.osu.cz/',true,'2026-10-04'),
('osu-fss','osu','osu-fss','Fakulta sociálních studií','FSS','https://fss.osu.cz/',true,'2026-10-04')
on conflict (id) do update set university_id=excluded.university_id,slug=excluded.slug,name=excluded.name,
  short_name=excluded.short_name,official_url=excluded.official_url,is_active=true,last_verified_at=excluded.last_verified_at;

insert into public.content_sources
  (id,university_id,faculty_id,city_id,source_type,source_url,official_domain,format,parser_key,enabled,refresh_interval,
   sync_status,terms_note,academic_year,confidence,requires_review,notes,source_document_title,monitoring_mode,next_check_at)
values
('src-ostrava-vsbtuo','vsbtuo','vsbtuo-hgf','ostrava','academic_calendar','https://www.vsb.cz/cs/student/harmonogram/?academicYear=2026','vsb.cz','html','generic-academic-html',true,interval '9 hours','idle','Centrální oficiální harmonogram VŠB-TUO 2026/2027; technicky ukotvený k fakultě kvůli současnému schématu.','2026/2027',0.98,true,'Nalezené změny musí projít ruční kontrolou.','Harmonogram akademického roku 2026/2027','automatic_review',now()),
('src-ostrava-osu-prf','osu','osu-prf','ostrava','academic_calendar','https://dokumenty.osu.cz/prf/urednideska/prf-harmonogram-2026-2027.pdf','dokumenty.osu.cz','pdf','pdfjs-academic-calendar',true,interval '9 hours','idle','Oficiální harmonogram PřF OU 2026/2027.','2026/2027',0.98,true,'PDF změny musí projít ruční kontrolou.','Harmonogram akademického roku 2026/2027 PřF OU','automatic_review',now()),
('src-ostrava-osu-fss','osu','osu-fss','ostrava','academic_calendar','https://dokumenty.osu.cz/fss/urednideska/harmonogram-akademickeho-roku-fss-2026-2027.pdf','dokumenty.osu.cz','pdf','pdfjs-academic-calendar',true,interval '9 hours','idle','Oficiální harmonogram FSS OU 2026/2027.','2026/2027',0.98,true,'PDF změny musí projít ruční kontrolou.','Harmonogram akademického roku 2026/2027 FSS OU','automatic_review',now()),
('src-fajn-brigady-ostrava',null,null,'ostrava','job_feed','https://www.fajn-brigady.cz/brigady/ostrava/','media.fajnsprava.cz','xml','fajn-v2-xml',true,interval '9 hours','idle','Smluvní XML feed Fajn brigády pro Ostravu; skutečná URL je pouze v serverovém prostředí.',null,1.0,false,'Importuje pouze bezpečně normalizovaná veřejná pole.','Fajn brigády – Ostrava','automatic_publish',now())
on conflict (id) do update set city_id='ostrava',source_url=excluded.source_url,official_domain=excluded.official_domain,
  format=excluded.format,parser_key=excluded.parser_key,enabled=true,refresh_interval=excluded.refresh_interval,
  academic_year=excluded.academic_year,confidence=excluded.confidence,requires_review=excluded.requires_review,notes=excluded.notes,
  source_document_title=excluded.source_document_title,monitoring_mode=excluded.monitoring_mode,next_check_at=least(public.content_sources.next_check_at,now());

with source_data(university_id,faculty_id,source_id,external_id,title,description,category,starts_at,ends_at,semester,scope_type,source_url) as (values
('vsbtuo',null,'src-ostrava-vsbtuo','vsbtuo-academic-year-2026','Akademický rok 2026/2027 na VŠB-TUO','Oficiální období akademického roku VŠB-TUO.','other'::public.event_category,'2026-09-01 00:00:00+02'::timestamptz,'2027-08-31 23:59:59+02'::timestamptz,'year_round','university','https://www.vsb.cz/cs/student/harmonogram/?academicYear=2026'),
('vsbtuo',null,'src-ostrava-vsbtuo','vsbtuo-winter-teaching-2026','Výuka v zimním semestru VŠB-TUO','Období výuky podle centrálního harmonogramu VŠB-TUO.','teaching','2026-09-14 00:00:00+02','2026-12-12 23:59:59+01','autumn','university','https://www.vsb.cz/cs/student/harmonogram/?academicYear=2026'),
('vsbtuo',null,'src-ostrava-vsbtuo','vsbtuo-winter-exams-2026','Zimní zkouškové období VŠB-TUO','Zkouškové období podle centrálního harmonogramu VŠB-TUO.','exam','2026-12-14 00:00:00+01','2027-02-06 23:59:59+01','autumn','university','https://www.vsb.cz/cs/student/harmonogram/?academicYear=2026'),
('vsbtuo',null,'src-ostrava-vsbtuo','vsbtuo-christmas-break-2026','Vánoční prázdniny na VŠB-TUO','Vánoční prázdniny podle centrálního harmonogramu.','holiday','2026-12-24 00:00:00+01','2027-01-03 23:59:59+01','autumn','university','https://www.vsb.cz/cs/student/harmonogram/?academicYear=2026'),
('vsbtuo',null,'src-ostrava-vsbtuo','vsbtuo-winter-break-2027','Zimní prázdniny na VŠB-TUO','Zimní prázdniny podle centrálního harmonogramu.','holiday','2027-02-08 00:00:00+01','2027-02-14 23:59:59+01','spring','university','https://www.vsb.cz/cs/student/harmonogram/?academicYear=2026'),
('vsbtuo',null,'src-ostrava-vsbtuo','vsbtuo-summer-teaching-2027','Výuka v letním semestru VŠB-TUO','Období výuky podle centrálního harmonogramu VŠB-TUO.','teaching','2027-02-15 00:00:00+01','2027-05-15 23:59:59+02','spring','university','https://www.vsb.cz/cs/student/harmonogram/?academicYear=2026'),
('vsbtuo',null,'src-ostrava-vsbtuo','vsbtuo-summer-exams-2027','Letní zkouškové období VŠB-TUO','Zkouškové období podle centrálního harmonogramu VŠB-TUO.','exam','2027-05-17 00:00:00+02','2027-06-26 23:59:59+02','spring','university','https://www.vsb.cz/cs/student/harmonogram/?academicYear=2026'),
('vsbtuo',null,'src-ostrava-vsbtuo','vsbtuo-summer-break-2027','Letní prázdniny na VŠB-TUO','Letní prázdniny podle centrálního harmonogramu VŠB-TUO.','holiday','2027-06-28 00:00:00+02','2027-08-31 23:59:59+02','year_round','university','https://www.vsb.cz/cs/student/harmonogram/?academicYear=2026'),
('osu','osu-prf','src-ostrava-osu-prf','osu-prf-winter-teaching-2026','Výuka v zimním semestru PřF OU','Pravidelná výuka podle oficiálního harmonogramu PřF OU.','teaching','2026-09-21 00:00:00+02','2026-12-18 23:59:59+01','autumn','faculty','https://dokumenty.osu.cz/prf/urednideska/prf-harmonogram-2026-2027.pdf'),
('osu','osu-prf','src-ostrava-osu-prf','osu-prf-christmas-break-2026','Zimní prázdniny na PřF OU','Zimní prázdniny podle oficiálního harmonogramu PřF OU.','holiday','2026-12-24 00:00:00+01','2027-01-03 23:59:59+01','autumn','faculty','https://dokumenty.osu.cz/prf/urednideska/prf-harmonogram-2026-2027.pdf'),
('osu','osu-prf','src-ostrava-osu-prf','osu-prf-winter-exams-2027','Zimní zkouškové období PřF OU','Zkouškové období podle oficiálního harmonogramu PřF OU.','exam','2027-01-04 00:00:00+01','2027-02-12 23:59:59+01','autumn','faculty','https://dokumenty.osu.cz/prf/urednideska/prf-harmonogram-2026-2027.pdf'),
('osu','osu-prf','src-ostrava-osu-prf','osu-prf-summer-teaching-2027','Výuka v letním semestru PřF OU','Pravidelná výuka podle oficiálního harmonogramu PřF OU.','teaching','2027-02-15 00:00:00+01','2027-05-14 23:59:59+02','spring','faculty','https://dokumenty.osu.cz/prf/urednideska/prf-harmonogram-2026-2027.pdf'),
('osu','osu-prf','src-ostrava-osu-prf','osu-prf-easter-break-2027','Velikonoční prázdniny na PřF OU','Velikonoční prázdniny podle oficiálního harmonogramu PřF OU.','holiday','2027-03-25 00:00:00+01','2027-03-29 23:59:59+02','spring','faculty','https://dokumenty.osu.cz/prf/urednideska/prf-harmonogram-2026-2027.pdf')
), prepared as (
  select s.*,u.short_name,
    ('74'||substr(md5(external_id),1,6)||'-'||substr(md5(external_id),7,4)||'-4'||substr(md5(external_id),11,3)||'-8'||substr(md5(external_id),14,3)||'-'||substr(md5(external_id),17,12))::uuid id
  from source_data s join public.universities u on u.id=s.university_id
)
insert into public.academic_events
  (id,title,description,category,school,faculty,starts_at,ends_at,source_name,source_url,source_updated_at,status,is_demo,
   external_id,source_id,all_day,timezone,academic_year,source_hash,confidence,last_verified_at,verification_status,change_state,
   is_cancelled,manual_override,duplicate_fingerprint,scope_type,university_id,faculty_id,city_id,source_document_title,semester)
select id,title,description,category,short_name,coalesce((select short_name from public.faculties where id=faculty_id),'Všechny fakulty'),
  starts_at,ends_at,'Oficiální harmonogram '||short_name,source_url,'2026-10-04 00:00:00+02','approved',false,
  external_id,source_id,true,'Europe/Prague','2026/2027',md5(external_id)||md5(external_id||'source'),0.98,
  '2026-10-04 00:00:00+02','verified','unchanged',false,false,md5(external_id)||md5(external_id||'event'),
  scope_type,university_id,faculty_id,'ostrava','Harmonogram akademického roku 2026/2027',semester
from prepared
on conflict (id) do update set title=excluded.title,description=excluded.description,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
  source_url=excluded.source_url,last_verified_at=excluded.last_verified_at,verification_status='verified',academic_year='2026/2027',
  city_id='ostrava',university_id=excluded.university_id,faculty_id=excluded.faculty_id,source_id=excluded.source_id;

insert into public.community_events
  (id,city_id,title,category,starts_at,ends_at,venue,description,is_free,price_amount,currency,event_url,image_url,
   duplicate_fingerprint,status,organizer,source_type,source_url,source_external_id,last_verified_at,source_sync_status,
   university_id,faculty_id,attendance_mode)
values
('b4000000-0000-4000-8000-000000000001','ostrava','Festival ostravských knihoven','Studium a vzdělávání','2026-10-06 09:00:00+02','2026-10-06 18:00:00+02','BBi Ostravica','Desátý ročník společného festivalu ostravských knihoven s veletrhem, přednáškami, workshopy a knižním swapem.',true,null,'CZK','https://knihovna.vsb.cz/cs/o-knihovne/novinky/detail-novinky/?reportId=52587',null,md5('ostrava-festival-knihoven-2026')||md5('ostrava-festival-knihoven-2026-source'),'published','Ostravské knihovny','external','https://knihovna.vsb.cz/cs/o-knihovne/novinky/detail-novinky/?reportId=52587','ostrava-festival-knihoven-2026','2026-10-04 00:00:00+02','verified','vsbtuo',null,'in_person')
on conflict (city_id,source_external_id) where source_type='external' and source_external_id is not null do update set
  title=excluded.title,category=excluded.category,starts_at=excluded.starts_at,ends_at=excluded.ends_at,venue=excluded.venue,
  description=excluded.description,is_free=excluded.is_free,event_url=excluded.event_url,organizer=excluded.organizer,
  source_url=excluded.source_url,last_verified_at=excluded.last_verified_at,source_sync_status='verified';

insert into public.places
  (id,city_id,name,category,description,why_visit,address,latitude,longitude,opening_hours,website_url,source_url,
   last_verified_at,opening_hours_verified_at,verification_status,status,is_demo,university_id,faculty_id,price_level,
   student_discount,source_external_id,access_conditions,source_sync_status,source_checked_at,origin,public_access,student_only,source_license)
values
('c4000000-0000-4000-8000-000000000001','ostrava','Ústřední knihovna VŠB-TUO','library','Univerzitní knihovna a studovna v hlavním kampusu VŠB-TUO.','Odborné fondy, studijní zázemí a služby přímo v kampusu.','17. listopadu 2172/15, Ostrava-Poruba',49.8313700,18.1626025,'Aktuální provoz ověřte na webu knihovny.','https://knihovna.vsb.cz/','https://knihovna.vsb.cz/cs/o-knihovne/kontakty/','2026-10-04','2026-10-04','verified','approved',false,'vsbtuo',null,'free',null,'ostrava-vsbtuo-central-library','Vstup podle knihovního řádu.','verified','2026-10-04','official',true,false,'Oficiální web VŠB-TUO'),
('c4000000-0000-4000-8000-000000000002','ostrava','Univerzitní knihovna OU','library','Hlavní budova Univerzitní knihovny Ostravské univerzity.','Studovna a univerzitní knihovní služby v centru Ostravy.','Bráfova 3, Ostrava',49.8399500,18.2891500,'Po–Čt 8:00–18:00, Pá 8:00–16:00; aktuální omezení ověřte na webu.','https://knihovna.osu.cz/','https://knihovna.osu.cz/o-knihovne/','2026-10-04','2026-10-04','verified','approved',false,'osu',null,'free',null,'ostrava-osu-university-library','Vstup podle knihovního řádu.','verified','2026-10-04','official',true,false,'Oficiální web OU'),
('c4000000-0000-4000-8000-000000000003','ostrava','Kartové centrum OU','student_service','Pracoviště pro studentské identifikační karty a ISIC Ostravské univerzity.','Vyřízení a správa studentské karty na jednom místě.','Bráfova 3, Ostrava',49.8399500,18.2891500,'Od 12. 10. 2026: Po–St 8:00–11:00 a 13:00–15:00; další časy na rezervaci.','https://cit.osu.cz/kartove-centrum/','https://cit.osu.cz/kartove-centrum/','2026-10-04','2026-10-04','verified','approved',false,'osu',null,'low',null,'ostrava-osu-card-centre','Služba je určena studentům a zaměstnancům OU.','verified','2026-10-04','official',false,true,'Oficiální web OU'),
('c4000000-0000-4000-8000-000000000004','ostrava','Koleje VŠB-TUO','student_service','Areál vysokoškolských kolejí VŠB-TUO v Porubě.','Ubytovací služby v docházkové vzdálenosti od hlavního kampusu.','Studentská 1770/1, Ostrava-Poruba',49.8373226,18.1569873,'Aktuální provoz ubytovacích služeb ověřte na webu.','https://www.vsb.cz/ubytovani/cs/','https://www.vsb.cz/ubytovani/cs/kontakty/kontakty_ubytovaci_sluzby/','2026-10-04',null,'verified','approved',false,'vsbtuo',null,'low',null,'ostrava-vsbtuo-dormitories','Ubytovací služby podle pravidel VŠB-TUO.','verified','2026-10-04','official',false,true,'Oficiální web VŠB-TUO')
on conflict (id) do update set name=excluded.name,category=excluded.category,description=excluded.description,why_visit=excluded.why_visit,
  address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,opening_hours=excluded.opening_hours,
  website_url=excluded.website_url,source_url=excluded.source_url,last_verified_at=excluded.last_verified_at,
  opening_hours_verified_at=excluded.opening_hours_verified_at,verification_status='verified',status='approved',is_demo=false,
  university_id=excluded.university_id,faculty_id=excluded.faculty_id,price_level=excluded.price_level,
  student_discount=excluded.student_discount,source_external_id=excluded.source_external_id,access_conditions=excluded.access_conditions,
  source_sync_status='verified',source_checked_at=excluded.source_checked_at,origin='official',public_access=excluded.public_access,
  student_only=excluded.student_only,source_license=excluded.source_license,city_id='ostrava';

update public.places
set dedupe_key = 'official:' || source_external_id
where city_id='ostrava' and source_external_id like 'ostrava-%' and dedupe_key is null;

insert into public.city_configuration_audit(city_id,actor_id,action,previous_config,new_config)
select 'ostrava',null,'published','{"publicStatus":"draft","enabled":false}'::jsonb,
  '{"publicStatus":"published","enabled":true,"jobs":true,"offers":false,"verifiedAt":"2026-10-04"}'::jsonb
where not exists (
  select 1 from public.city_configuration_audit
  where city_id='ostrava' and action='published' and new_config->>'verifiedAt'='2026-10-04'
);
