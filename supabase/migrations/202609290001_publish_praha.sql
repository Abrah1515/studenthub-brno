-- Veřejné spuštění Prahy nad existující multi-city architekturou.
-- Pouze ověřené veřejné zdroje, idempotentní upsert a vypnuté brigády/nabídky.

insert into public.cities (
  id,slug,name,region,country_code,timezone,latitude,longitude,map_bounds,map_zoom,
  enabled,public_status,sort_order,brand_config,module_config
) values (
  'praha','praha','Praha','Hlavní město Praha','CZ','Europe/Prague',50.075500,14.437800,
  '[[49.94,14.22],[50.18,14.71]]'::jsonb,12,true,'published',20,
  '{"editionName":"StudentHub Praha","editionShortName":"Praha","seoTitle":"StudentHub Praha – prakticky pro studenty","seoDescription":"Ověřené termíny, místa, komunita a praktické služby pro studenty v Praze."}'::jsonb,
  '{"calendar":true,"places":true,"community":true,"buddy":true,"marketplace":true,"housing":true,"jobs":false,"chat":true,"watcher":true,"settings":true,"offers":false}'::jsonb
) on conflict (id) do update set
  slug=excluded.slug,name=excluded.name,region=excluded.region,country_code=excluded.country_code,
  timezone=excluded.timezone,latitude=excluded.latitude,longitude=excluded.longitude,map_bounds=excluded.map_bounds,
  map_zoom=excluded.map_zoom,enabled=true,public_status='published',sort_order=excluded.sort_order,
  brand_config=excluded.brand_config,module_config=excluded.module_config,updated_at=now();

insert into public.community_moderation_settings(city_id)
values ('praha') on conflict (city_id) do nothing;

insert into public.universities (id,slug,name,short_name,city,website_url,is_active,last_verified_at) values
('cuni','cuni','Univerzita Karlova','UK','Praha','https://cuni.cz/',true,'2026-09-29 00:00:00+02'),
('cvut','cvut','České vysoké učení technické v Praze','ČVUT','Praha','https://www.cvut.cz/',true,'2026-09-29 00:00:00+02'),
('vse','vse','Vysoká škola ekonomická v Praze','VŠE','Praha','https://www.vse.cz/',true,'2026-09-29 00:00:00+02'),
('czu','czu','Česká zemědělská univerzita v Praze','ČZU','Praha','https://www.czu.cz/',true,'2026-09-29 00:00:00+02'),
('vscht','vscht','Vysoká škola chemicko-technologická v Praze','VŠCHT','Praha','https://www.vscht.cz/',true,'2026-09-29 00:00:00+02')
on conflict (id) do update set slug=excluded.slug,name=excluded.name,short_name=excluded.short_name,city='Praha',
  website_url=excluded.website_url,is_active=true,last_verified_at=excluded.last_verified_at;

insert into public.university_cities(university_id,city_id,is_primary) values
('cuni','praha',true),('cvut','praha',true),('vse','praha',true),('czu','praha',true),('vscht','praha',true)
on conflict (university_id,city_id) do update set is_primary=true;

insert into public.faculties(id,university_id,slug,name,short_name,official_url,is_active,last_verified_at) values
('cuni-ktf','cuni','cuni-ktf','Katolická teologická fakulta','KTF','https://ktf.cuni.cz/',true,'2026-09-29'),
('cuni-etf','cuni','cuni-etf','Evangelická teologická fakulta','ETF','https://web.etf.cuni.cz/',true,'2026-09-29'),
('cuni-htf','cuni','cuni-htf','Husitská teologická fakulta','HTF','https://htf.cuni.cz/',true,'2026-09-29'),
('cuni-prf','cuni','cuni-prf','Právnická fakulta','PrF','https://www.prf.cuni.cz/',true,'2026-09-29'),
('cuni-lf1','cuni','cuni-lf1','1. lékařská fakulta','1. LF','https://www.lf1.cuni.cz/',true,'2026-09-29'),
('cuni-lf2','cuni','cuni-lf2','2. lékařská fakulta','2. LF','https://www.lf2.cuni.cz/',true,'2026-09-29'),
('cuni-lf3','cuni','cuni-lf3','3. lékařská fakulta','3. LF','https://www.lf3.cuni.cz/',true,'2026-09-29'),
('cuni-ff','cuni','cuni-ff','Filozofická fakulta','FF','https://www.ff.cuni.cz/',true,'2026-09-29'),
('cuni-prirod','cuni','cuni-prirod','Přírodovědecká fakulta','PřF','https://natur.cuni.cz/',true,'2026-09-29'),
('cuni-mff','cuni','cuni-mff','Matematicko-fyzikální fakulta','MFF','https://www.mff.cuni.cz/',true,'2026-09-29'),
('cuni-pedf','cuni','cuni-pedf','Pedagogická fakulta','PedF','https://pedf.cuni.cz/',true,'2026-09-29'),
('cuni-fsv','cuni','cuni-fsv','Fakulta sociálních věd','FSV','https://fsv.cuni.cz/',true,'2026-09-29'),
('cuni-fhs','cuni','cuni-fhs','Fakulta humanitních studií','FHS','https://fhs.cuni.cz/',true,'2026-09-29'),
('cuni-ftvs','cuni','cuni-ftvs','Fakulta tělesné výchovy a sportu','FTVS','https://ftvs.cuni.cz/',true,'2026-09-29'),
('cvut-fsv','cvut','cvut-fsv','Fakulta stavební','FSv','https://www.fsv.cvut.cz/',true,'2026-09-29'),
('cvut-fs','cvut','cvut-fs','Fakulta strojní','FS','https://fs.cvut.cz/',true,'2026-09-29'),
('cvut-fel','cvut','cvut-fel','Fakulta elektrotechnická','FEL','https://fel.cvut.cz/',true,'2026-09-29'),
('cvut-fjfi','cvut','cvut-fjfi','Fakulta jaderná a fyzikálně inženýrská','FJFI','https://fjfi.cvut.cz/',true,'2026-09-29'),
('cvut-fa','cvut','cvut-fa','Fakulta architektury','FA','https://www.fa.cvut.cz/',true,'2026-09-29'),
('cvut-fd','cvut','cvut-fd','Fakulta dopravní','FD','https://www.fd.cvut.cz/',true,'2026-09-29'),
('cvut-fbmi','cvut','cvut-fbmi','Fakulta biomedicínského inženýrství','FBMI','https://www.fbmi.cvut.cz/',true,'2026-09-29'),
('cvut-fit','cvut','cvut-fit','Fakulta informačních technologií','FIT','https://fit.cvut.cz/',true,'2026-09-29'),
('vse-ffu','vse','vse-ffu','Fakulta financí a účetnictví','FFÚ','https://ffu.vse.cz/',true,'2026-09-29'),
('vse-fmv','vse','vse-fmv','Fakulta mezinárodních vztahů','FMV','https://fmv.vse.cz/',true,'2026-09-29'),
('vse-fph','vse','vse-fph','Fakulta podnikohospodářská','FPH','https://fph.vse.cz/',true,'2026-09-29'),
('vse-fis','vse','vse-fis','Fakulta informatiky a statistiky','FIS','https://fis.vse.cz/',true,'2026-09-29'),
('vse-nf','vse','vse-nf','Národohospodářská fakulta','NF','https://nf.vse.cz/',true,'2026-09-29'),
('czu-fappz','czu','czu-fappz','Fakulta agrobiologie, potravinových a přírodních zdrojů','FAPPZ','https://www.fappz.czu.cz/',true,'2026-09-29'),
('czu-pef','czu','czu-pef','Provozně ekonomická fakulta','PEF','https://www.pef.czu.cz/',true,'2026-09-29'),
('czu-tf','czu','czu-tf','Technická fakulta','TF','https://www.tf.czu.cz/',true,'2026-09-29'),
('czu-fld','czu','czu-fld','Fakulta lesnická a dřevařská','FLD','https://www.fld.czu.cz/',true,'2026-09-29'),
('czu-fzp','czu','czu-fzp','Fakulta životního prostředí','FŽP','https://www.fzp.czu.cz/',true,'2026-09-29'),
('czu-ftz','czu','czu-ftz','Fakulta tropického zemědělství','FTZ','https://www.ftz.czu.cz/',true,'2026-09-29'),
('vscht-fcht','vscht','vscht-fcht','Fakulta chemické technologie','FCHT','https://fcht.vscht.cz/',true,'2026-09-29'),
('vscht-ftop','vscht','vscht-ftop','Fakulta technologie ochrany prostředí','FTOP','https://ftop.vscht.cz/',true,'2026-09-29'),
('vscht-fpbt','vscht','vscht-fpbt','Fakulta potravinářské a biochemické technologie','FPBT','https://fpbt.vscht.cz/',true,'2026-09-29'),
('vscht-fchi','vscht','vscht-fchi','Fakulta chemicko-inženýrská','FCHI','https://fchi.vscht.cz/',true,'2026-09-29')
on conflict (id) do update set university_id=excluded.university_id,slug=excluded.slug,name=excluded.name,
  short_name=excluded.short_name,official_url=excluded.official_url,is_active=true,last_verified_at=excluded.last_verified_at;

insert into public.content_sources
  (id,university_id,faculty_id,city_id,source_type,source_url,official_domain,format,parser_key,enabled,refresh_interval,
   sync_status,terms_note,academic_year,confidence,requires_review,notes,source_document_title,monitoring_mode,next_check_at)
values
('src-praha-cuni','cuni','cuni-ktf','praha','academic_calendar','https://cuni.cz/UK-3952.html','cuni.cz','html','generic-academic-html',true,interval '9 hours','idle','Centrální oficiální harmonogram UK 2026/2027; technicky ukotvený k fakultě kvůli současnému schématu zdrojů.','2026/2027',0.95,true,'Změny musí projít ruční kontrolou.','Harmonogram akademického roku 2026/2027','automatic_review',now()),
('src-praha-cvut','cvut','cvut-fs','praha','academic_calendar','https://www.cvut.cz/sites/default/files/content/d1dc93cd-5894-4521-b799-c7e715d3c59e/cs/20251009-harmonogram-akademickeho-roku-20262027.pdf','cvut.cz','pdf','pdfjs-academic-calendar',true,interval '9 hours','idle','Centrální celouniverzitní harmonogram ČVUT 2026/2027; technicky ukotvený k fakultě kvůli současnému schématu zdrojů.','2026/2027',0.98,true,'PDF změny musí projít ruční kontrolou.','Harmonogram akademického roku 2026/2027','automatic_review',now()),
('src-praha-cvut-fjfi','cvut','cvut-fjfi','praha','academic_calendar','https://edu.fjfi.cvut.cz/edu/Harmonogramy/Harmonogram_2026_2027.pdf','fjfi.cvut.cz','pdf','pdfjs-academic-calendar',true,interval '9 hours','idle','Oficiální časový plán FJFI ČVUT 2026/2027.','2026/2027',0.98,true,'PDF změny musí projít ruční kontrolou.','Časový plán akademického roku 2026/2027 FJFI','automatic_review',now()),
('src-praha-vse','vse','vse-ffu','praha','academic_calendar','https://www.vse.cz/studenti/studium/harmonogramy/','vse.cz','html','generic-academic-html',true,interval '9 hours','idle','Centrální oficiální harmonogramy VŠE 2026/2027; technicky ukotvené k fakultě kvůli současnému schématu zdrojů.','2026/2027',0.95,true,'Změny musí projít ruční kontrolou.','Harmonogram akademického roku 2026/2027','automatic_review',now()),
('src-praha-czu','czu','czu-fappz','praha','academic_calendar','https://www.czu.cz/dl/154159?lang=cs','czu.cz','pdf','pdfjs-academic-calendar',true,interval '9 hours','idle','Centrální rozhodnutí rektora ČZU č. 4/2026; technicky ukotvené k fakultě kvůli současnému schématu zdrojů.','2026/2027',0.98,true,'PDF změny musí projít ruční kontrolou.','Harmonogram akademického roku 2026/2027','automatic_review',now()),
('src-praha-vscht','vscht','vscht-fcht','praha','academic_calendar','https://studium.vscht.cz/organizace-roku-vyuky?jazyk=cs&lang=cs','studium.vscht.cz','html','generic-academic-html',true,interval '9 hours','idle','Centrální výnos VŠCHT A/V/961/11/2026; technicky ukotvený k fakultě kvůli současnému schématu zdrojů.','2026/2027',0.98,true,'Změny musí projít ruční kontrolou.','Organizace akademického roku 2026/2027','automatic_review',now())
on conflict (id) do update set city_id='praha',source_url=excluded.source_url,official_domain=excluded.official_domain,
  format=excluded.format,parser_key=excluded.parser_key,enabled=true,refresh_interval=excluded.refresh_interval,
  academic_year='2026/2027',confidence=excluded.confidence,requires_review=true,notes=excluded.notes,
  source_document_title=excluded.source_document_title,monitoring_mode=excluded.monitoring_mode,next_check_at=least(public.content_sources.next_check_at,now());

with source_data(university_id,source_id,external_id,title,description,category,starts_at,ends_at,semester,source_url) as (values
('cuni','src-praha-cuni','cuni-academic-year-2026','Akademický rok 2026/2027 na UK','Oficiální období akademického roku Univerzity Karlovy.','other'::public.event_category,'2026-10-01 00:00:00+02'::timestamptz,'2027-09-30 23:59:59+02'::timestamptz,'year_round','https://cuni.cz/UK-3952.html'),
('cuni','src-praha-cuni','cuni-christmas-break-2026','Vánoční prázdniny na UK','Vánoční prázdniny podle celouniverzitního harmonogramu.','holiday','2026-12-21 00:00:00+01','2027-01-01 23:59:59+01','autumn','https://cuni.cz/UK-3952.html'),
('cuni','src-praha-cuni','cuni-summer-semester-start-2027','Začátek letního semestru na UK','Zahájení letního semestru Univerzity Karlovy.','teaching','2027-02-15 00:00:00+01','2027-02-15 23:59:59+01','spring','https://cuni.cz/UK-3952.html'),
('cuni','src-praha-cuni','cuni-summer-break-2027','Letní prázdniny na UK','Letní prázdniny podle celouniverzitního harmonogramu.','holiday','2027-07-01 00:00:00+02','2027-08-31 23:59:59+02','year_round','https://cuni.cz/UK-3952.html'),
('cvut','src-praha-cvut','cvut-academic-year-2026','Akademický rok 2026/2027 na ČVUT','Oficiální období akademického roku ČVUT.','other','2026-09-21 00:00:00+02','2027-09-19 23:59:59+02','year_round','https://www.cvut.cz/sites/default/files/content/d1dc93cd-5894-4521-b799-c7e715d3c59e/cs/20251009-harmonogram-akademickeho-roku-20262027.pdf'),
('cvut','src-praha-cvut','cvut-winter-teaching-2026','Výuka v zimním semestru ČVUT','Období výuky podle celouniverzitního harmonogramu ČVUT.','teaching','2026-09-21 00:00:00+02','2027-01-10 23:59:59+01','autumn','https://www.cvut.cz/sites/default/files/content/d1dc93cd-5894-4521-b799-c7e715d3c59e/cs/20251009-harmonogram-akademickeho-roku-20262027.pdf'),
('cvut','src-praha-cvut','cvut-christmas-break-2026','Zimní prázdniny na ČVUT','Zimní prázdniny podle celouniverzitního harmonogramu ČVUT.','holiday','2026-12-21 00:00:00+01','2027-01-03 23:59:59+01','autumn','https://www.cvut.cz/sites/default/files/content/d1dc93cd-5894-4521-b799-c7e715d3c59e/cs/20251009-harmonogram-akademickeho-roku-20262027.pdf'),
('cvut','src-praha-cvut','cvut-winter-exams-2027','Zimní zkouškové období ČVUT','Zkouškové období podle celouniverzitního harmonogramu ČVUT.','exam','2027-01-11 00:00:00+01','2027-02-14 23:59:59+01','autumn','https://www.cvut.cz/sites/default/files/content/d1dc93cd-5894-4521-b799-c7e715d3c59e/cs/20251009-harmonogram-akademickeho-roku-20262027.pdf'),
('cvut','src-praha-cvut','cvut-summer-teaching-2027','Výuka v letním semestru ČVUT','Období výuky podle celouniverzitního harmonogramu ČVUT.','teaching','2027-02-15 00:00:00+01','2027-05-23 23:59:59+02','spring','https://www.cvut.cz/sites/default/files/content/d1dc93cd-5894-4521-b799-c7e715d3c59e/cs/20251009-harmonogram-akademickeho-roku-20262027.pdf'),
('cvut','src-praha-cvut','cvut-summer-exams-2027','Letní zkouškové období ČVUT','Zkouškové období podle celouniverzitního harmonogramu ČVUT.','exam','2027-05-24 00:00:00+02','2027-06-27 23:59:59+02','spring','https://www.cvut.cz/sites/default/files/content/d1dc93cd-5894-4521-b799-c7e715d3c59e/cs/20251009-harmonogram-akademickeho-roku-20262027.pdf'),
('cvut','src-praha-cvut','cvut-summer-break-2027','Letní prázdniny na ČVUT','Letní prázdniny podle celouniverzitního harmonogramu ČVUT.','holiday','2027-06-28 00:00:00+02','2027-08-29 23:59:59+02','year_round','https://www.cvut.cz/sites/default/files/content/d1dc93cd-5894-4521-b799-c7e715d3c59e/cs/20251009-harmonogram-akademickeho-roku-20262027.pdf'),
('vse','src-praha-vse','vse-winter-teaching-2026','Výuka v zimním semestru VŠE','Výuka bakalářského a magisterského studia podle harmonogramu VŠE.','teaching','2026-09-21 00:00:00+02','2026-12-18 23:59:59+01','autumn','https://www.vse.cz/studenti/studium/harmonogramy/'),
('vse','src-praha-vse','vse-winter-exams-main-2027','Hlavní část zimního zkouškového období VŠE','Souvislá lednová a únorová část zkouškového období; harmonogram uvádí také samostatné prosincové dny.','exam','2027-01-04 00:00:00+01','2027-02-07 23:59:59+01','autumn','https://www.vse.cz/studenti/studium/harmonogramy/'),
('vse','src-praha-vse','vse-summer-teaching-2027','Výuka v letním semestru VŠE','Výuka bakalářského a magisterského studia podle harmonogramu VŠE.','teaching','2027-02-15 00:00:00+01','2027-05-14 23:59:59+02','spring','https://www.vse.cz/studenti/studium/harmonogramy/'),
('vse','src-praha-vse','vse-summer-exams-2027','Letní zkouškové období VŠE','Zkouškové období bakalářského a magisterského studia.','exam','2027-05-17 00:00:00+02','2027-06-27 23:59:59+02','spring','https://www.vse.cz/studenti/studium/harmonogramy/'),
('czu','src-praha-czu','czu-winter-registration-2026','Zápis do rozvrhu na zimní semestr ČZU','Zápis do rozvrhu pro prezenční studium.','registration','2026-09-21 00:00:00+02','2026-09-27 23:59:59+02','autumn','https://www.czu.cz/dl/154159?lang=cs'),
('czu','src-praha-czu','czu-winter-teaching-2026','Výuka v zimním semestru ČZU','Výuka podle rozhodnutí rektora ČZU č. 4/2026.','teaching','2026-09-29 00:00:00+02','2026-12-18 23:59:59+01','autumn','https://www.czu.cz/dl/154159?lang=cs'),
('czu','src-praha-czu','czu-christmas-break-2026','Vánoční prázdniny na ČZU','Vánoční prázdniny podle rozhodnutí rektora.','holiday','2026-12-21 00:00:00+01','2027-01-03 23:59:59+01','autumn','https://www.czu.cz/dl/154159?lang=cs'),
('czu','src-praha-czu','czu-winter-exams-2027','Zimní zkouškové období ČZU','Zkouškové období prezenčního studia.','exam','2027-01-04 00:00:00+01','2027-02-07 23:59:59+01','autumn','https://www.czu.cz/dl/154159?lang=cs'),
('vscht','src-praha-vscht','vscht-winter-teaching-2026','Výuka v zimním semestru VŠCHT','Výuka podle výnosu A/V/961/11/2026.','teaching','2026-09-14 00:00:00+02','2026-12-18 23:59:59+01','autumn','https://studium.vscht.cz/organizace-roku-vyuky?jazyk=cs&lang=cs'),
('vscht','src-praha-vscht','vscht-winter-exams-2027','Zimní zkouškové období VŠCHT','Zkouškové období podle výnosu A/V/961/11/2026.','exam','2027-01-04 00:00:00+01','2027-02-12 23:59:59+01','autumn','https://studium.vscht.cz/organizace-roku-vyuky?jazyk=cs&lang=cs'),
('vscht','src-praha-vscht','vscht-summer-teaching-2027','Výuka v letním semestru VŠCHT','Výuka podle výnosu A/V/961/11/2026.','teaching','2027-02-15 00:00:00+01','2027-05-21 23:59:59+02','spring','https://studium.vscht.cz/organizace-roku-vyuky?jazyk=cs&lang=cs'),
('vscht','src-praha-vscht','vscht-summer-exams-2027','Letní zkouškové období VŠCHT','Hlavní část letního zkouškového období podle výnosu A/V/961/11/2026.','exam','2027-05-24 00:00:00+02','2027-06-30 23:59:59+02','spring','https://studium.vscht.cz/organizace-roku-vyuky?jazyk=cs&lang=cs')
), prepared as (
  select s.*,u.short_name,
    ('73'||substr(md5(external_id),1,6)||'-'||substr(md5(external_id),7,4)||'-4'||substr(md5(external_id),11,3)||'-8'||substr(md5(external_id),14,3)||'-'||substr(md5(external_id),17,12))::uuid id
  from source_data s join public.universities u on u.id=s.university_id
)
insert into public.academic_events
  (id,title,description,category,school,faculty,starts_at,ends_at,source_name,source_url,source_updated_at,status,is_demo,
   external_id,source_id,all_day,timezone,academic_year,source_hash,confidence,last_verified_at,verification_status,change_state,
   is_cancelled,manual_override,duplicate_fingerprint,scope_type,university_id,faculty_id,city_id,source_document_title,semester)
select id,title,description,category,short_name,'Všechny fakulty',starts_at,ends_at,'Oficiální harmonogram '||short_name,source_url,
  '2026-09-29 00:00:00+02','approved',false,external_id,source_id,true,'Europe/Prague','2026/2027',
  md5(external_id)||md5(external_id||'source'),0.98,'2026-09-29 00:00:00+02','verified','unchanged',false,false,
  md5(external_id)||md5(external_id||'event'),'university',university_id,null,'praha','Harmonogram akademického roku 2026/2027',semester
from prepared
on conflict (id) do update set title=excluded.title,description=excluded.description,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
  source_url=excluded.source_url,last_verified_at=excluded.last_verified_at,verification_status='verified',academic_year='2026/2027',
  city_id='praha',university_id=excluded.university_id,source_id=excluded.source_id;

insert into public.academic_events
  (id,title,description,category,school,faculty,starts_at,ends_at,source_name,source_url,source_updated_at,status,is_demo,
   external_id,source_id,all_day,timezone,academic_year,source_hash,confidence,last_verified_at,verification_status,change_state,
   is_cancelled,manual_override,duplicate_fingerprint,scope_type,university_id,faculty_id,city_id,source_document_title,semester)
values
('d3000000-0000-4000-8000-000000000001','Imatrikulace nových studentů FJFI ČVUT','Imatrikulace nových studentů podle oficiálního časového plánu FJFI.','other','ČVUT','FJFI','2026-10-05 00:00:00+02','2026-10-05 23:59:59+02','Oficiální časový plán FJFI','https://edu.fjfi.cvut.cz/edu/Harmonogramy/Harmonogram_2026_2027.pdf','2026-01-07','approved',false,'cvut-fjfi-imatrikulation-2026','src-praha-cvut-fjfi',true,'Europe/Prague','2026/2027',md5('cvut-fjfi-imatrikulation-2026')||md5('source'),0.98,'2026-09-29 00:00:00+02','verified','unchanged',false,false,md5('cvut-fjfi-imatrikulation-2026')||md5('event'),'faculty','cvut','cvut-fjfi','praha','Časový plán akademického roku 2026/2027 FJFI','autumn'),
('d3000000-0000-4000-8000-000000000002','Státní závěrečné zkoušky FJFI – únorový termín','Únorový termín státních závěrečných zkoušek podle oficiálního časového plánu FJFI.','exam','ČVUT','FJFI','2027-01-25 00:00:00+01','2027-02-05 23:59:59+01','Oficiální časový plán FJFI','https://edu.fjfi.cvut.cz/edu/Harmonogramy/Harmonogram_2026_2027.pdf','2026-01-07','approved',false,'cvut-fjfi-szz-february-2027','src-praha-cvut-fjfi',true,'Europe/Prague','2026/2027',md5('cvut-fjfi-szz-february-2027')||md5('source'),0.98,'2026-09-29 00:00:00+02','verified','unchanged',false,false,md5('cvut-fjfi-szz-february-2027')||md5('event'),'faculty','cvut','cvut-fjfi','praha','Časový plán akademického roku 2026/2027 FJFI','autumn'),
('d3000000-0000-4000-8000-000000000003','Státní závěrečné zkoušky FJFI – červnový termín','Červnový termín státních závěrečných zkoušek podle oficiálního časového plánu FJFI.','exam','ČVUT','FJFI','2027-05-31 00:00:00+02','2027-06-11 23:59:59+02','Oficiální časový plán FJFI','https://edu.fjfi.cvut.cz/edu/Harmonogramy/Harmonogram_2026_2027.pdf','2026-01-07','approved',false,'cvut-fjfi-szz-june-2027','src-praha-cvut-fjfi',true,'Europe/Prague','2026/2027',md5('cvut-fjfi-szz-june-2027')||md5('source'),0.98,'2026-09-29 00:00:00+02','verified','unchanged',false,false,md5('cvut-fjfi-szz-june-2027')||md5('event'),'faculty','cvut','cvut-fjfi','praha','Časový plán akademického roku 2026/2027 FJFI','spring')
on conflict (id) do update set title=excluded.title,description=excluded.description,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
  source_url=excluded.source_url,last_verified_at=excluded.last_verified_at,verification_status='verified',academic_year='2026/2027',
  city_id='praha',university_id='cvut',faculty_id='cvut-fjfi',source_id='src-praha-cvut-fjfi';

insert into public.community_events
  (id,city_id,title,category,starts_at,ends_at,venue,description,is_free,price_amount,currency,event_url,image_url,
   duplicate_fingerprint,status,organizer,source_type,source_url,source_external_id,last_verified_at,source_sync_status,
   university_id,faculty_id,attendance_mode)
values
('b3000000-0000-4000-8000-000000000001','praha','Signal Festival','Technologie a věda','2026-10-15 19:00:00+02','2026-10-18 23:58:00+02','Praha – různá místa','Festival světla propojující současné umění a technologie. Venkovní instalace jsou zdarma, část programu je placená.',false,null,'CZK','https://prague.eu/cs/akce/signal-festival/',null,md5('praha-signal-2026')||md5('praha-signal-2026-source'),'published','SIGNAL Festival','external','https://prague.eu/cs/akce/signal-festival/','praha-signal-2026','2026-09-29 00:00:00+02','verified',null,null,'in_person'),
('b3000000-0000-4000-8000-000000000002','praha','Týden Akademie věd','Technologie a věda','2026-11-02 09:00:00+01','2026-11-08 20:00:00+01','Praha – různá místa','Přednášky, workshopy, výstavy a exkurze na vědecká pracoviště. U části programu je nutná rezervace.',true,null,'CZK','https://prague.eu/cs/akce/tyden-akademie-ved/',null,md5('praha-av-week-2026')||md5('praha-av-week-2026-source'),'published','Akademie věd ČR','external','https://prague.eu/cs/akce/tyden-akademie-ved/','praha-av-week-2026','2026-09-29 00:00:00+02','verified',null,null,'in_person'),
('b3000000-0000-4000-8000-000000000003','praha','Korzo Národní','Kultura','2026-11-17 10:00:00+01','2026-11-17 22:00:00+01','Národní třída, Praha','Veřejný kulturní a společenský program k výročí 17. listopadu. Přesný čas jednotlivých částí ověřte u pořadatele.',true,null,'CZK','https://prague.eu/cs/akce/korzo-narodni/',null,md5('praha-korzo-narodni-2026')||md5('praha-korzo-narodni-2026-source'),'published','Nerudný fest','external','https://prague.eu/cs/akce/korzo-narodni/','praha-korzo-narodni-2026','2026-09-29 00:00:00+02','verified',null,null,'in_person'),
('b3000000-0000-4000-8000-000000000004','praha','Papír Fest','Kultura','2026-11-28 10:00:00+01','2026-11-28 18:00:00+01','WPP Campus, Praha','Festival papírenské tvorby, ilustrace a autorských produktů. Aktuální vstupné ověřte na detailu akce.',false,null,'CZK','https://prague.eu/cs/akce/papir-fest/',null,md5('praha-papir-fest-2026')||md5('praha-papir-fest-2026-source'),'published','Papír Fest','external','https://prague.eu/cs/akce/papir-fest/','praha-papir-fest-2026','2026-09-29 00:00:00+02','verified',null,null,'in_person')
on conflict (city_id,source_external_id) where source_type='external' and source_external_id is not null do update set
  title=excluded.title,category=excluded.category,starts_at=excluded.starts_at,ends_at=excluded.ends_at,venue=excluded.venue,
  description=excluded.description,is_free=excluded.is_free,price_amount=excluded.price_amount,event_url=excluded.event_url,
  organizer=excluded.organizer,source_url=excluded.source_url,last_verified_at=excluded.last_verified_at,source_sync_status='verified';

insert into public.places
  (id,city_id,name,category,description,why_visit,address,latitude,longitude,opening_hours,website_url,source_url,
   last_verified_at,opening_hours_verified_at,verification_status,status,is_demo,university_id,faculty_id,price_level,
   student_discount,source_external_id,access_conditions,source_sync_status,source_checked_at,origin,public_access,student_only,source_license)
values
('c3000000-0000-4000-8000-000000000001','praha','Národní technická knihovna','library','Veřejná technická knihovna v kampusu Dejvice.','Studovny, odborné fondy a dlouhá provozní doba.','Technická 6, Praha 6',50.103100,14.390400,'Aktuální provoz ověřte na webu knihovny.','https://www.techlib.cz/','https://www.techlib.cz/','2026-09-29','2026-09-29','verified','approved',false,'cvut',null,'free',null,'praha-ntk','Veřejné části podle návštěvního řádu.','verified','2026-09-29','official',true,false,'Oficiální web NTK'),
('c3000000-0000-4000-8000-000000000002','praha','Knihovna Jana Palacha UK','library','Ústřední knihovna Filozofické fakulty UK.','Studium v centru Prahy a odborné fondy humanitních oborů.','náměstí Jana Palacha 2, Praha 1',50.089100,14.415700,'Aktuální provoz ověřte na webu fakulty.','https://knihovna.ff.cuni.cz/','https://knihovna.ff.cuni.cz/','2026-09-29','2026-09-29','verified','approved',false,'cuni','cuni-ff','free',null,'praha-uk-knihovna-palacha','Vstup podle pravidel knihovny.','verified','2026-09-29','official',true,false,'Oficiální web FF UK'),
('c3000000-0000-4000-8000-000000000003','praha','Knihovna společenských věd T. G. Masaryka','library','Knihovna v areálu UK Jinonice.','Zázemí pro studenty společenských a humanitních oborů.','U Kříže 8, Praha 5',50.054800,14.366900,'Aktuální provoz ověřte na webu knihovny.','https://knihovna.jinonice.cuni.cz/','https://knihovna.jinonice.cuni.cz/','2026-09-29','2026-09-29','verified','approved',false,'cuni','cuni-fsv','free',null,'praha-uk-knihovna-jinonice','Vstup podle pravidel knihovny.','verified','2026-09-29','official',true,false,'Oficiální web UK'),
('c3000000-0000-4000-8000-000000000004','praha','Centrum informačních a knihovnických služeb VŠE','library','Univerzitní knihovna v areálu VŠE Žižkov.','Studovna a ekonomické informační zdroje.','náměstí Winstona Churchilla 4, Praha 3',50.083200,14.441400,'Aktuální provoz ověřte na webu VŠE.','https://ciks.vse.cz/','https://ciks.vse.cz/','2026-09-29','2026-09-29','verified','approved',false,'vse',null,'free',null,'praha-vse-ciks','Vstup podle pravidel CIKS.','verified','2026-09-29','official',true,false,'Oficiální web VŠE'),
('c3000000-0000-4000-8000-000000000005','praha','Studijní a informační centrum ČZU','study_room','Studijní a informační zázemí v kampusu ČZU Suchdol.','Klidné studium přímo v univerzitním kampusu.','Kamýcká 129, Praha-Suchdol',50.129800,14.373600,'Aktuální provoz ověřte na webu ČZU.','https://sic.czu.cz/','https://sic.czu.cz/','2026-09-29','2026-09-29','verified','approved',false,'czu',null,'free',null,'praha-czu-sic','Vstup podle pravidel centra.','verified','2026-09-29','official',true,false,'Oficiální web ČZU'),
('c3000000-0000-4000-8000-000000000006','praha','Kampus Hybernská','coworking','Univerzitní a městský kampus pro vzdělávání, kulturu a komunitní setkávání.','Veřejný program, studijní zázemí a studentské akce v centru.','Hybernská 4, Praha 1',50.087800,14.432100,'Aktuální program a provoz ověřte na webu kampusu.','https://www.kampushybernska.cz/','https://www.kampushybernska.cz/','2026-09-29','2026-09-29','verified','approved',false,'cuni',null,'free',null,'praha-kampus-hybernska','Přístup podle programu a provozu jednotlivých prostor.','verified','2026-09-29','official',true,false,'Oficiální web Kampusu Hybernská'),
('c3000000-0000-4000-8000-000000000007','praha','UK Point','student_service','Informační a poradenské centrum Univerzity Karlovy.','Praktická podpora studujících na jednom místě.','Celetná 13, Praha 1',50.087300,14.423600,'Aktuální provoz ověřte na webu UK Point.','https://ukpoint.cuni.cz/','https://ukpoint.cuni.cz/','2026-09-29','2026-09-29','verified','approved',false,'cuni',null,'free',null,'praha-uk-point','Služby podle aktuální nabídky centra.','verified','2026-09-29','official',true,false,'Oficiální web UK'),
('c3000000-0000-4000-8000-000000000008','praha','Centrum informačních a poradenských služeb ČVUT','counselling','Poradenské centrum ČVUT pro studující.','Studijní, psychologické a další poradenské služby.','Bechyňova 3, Praha 6',50.105000,14.389000,'Objednání a provoz ověřte na webu centra.','https://www.cips.cvut.cz/','https://www.cips.cvut.cz/','2026-09-29','2026-09-29','verified','approved',false,'cvut',null,'free',null,'praha-cvut-cips','Některé služby vyžadují předchozí objednání.','verified','2026-09-29','official',false,true,'Oficiální web ČVUT'),
('c3000000-0000-4000-8000-000000000009','praha','Menza Studentský dům','canteen','Menza v kampusu ČVUT Dejvice.','Studentské stravování v blízkosti fakult a NTK.','Bílá 2571/6, Praha 6',50.105900,14.388200,'Aktuální provoz a jídelníček ověřte u SÚZ ČVUT.','https://www.suz.cvut.cz/stravovani/','https://www.suz.cvut.cz/stravovani/','2026-09-29','2026-09-29','verified','approved',false,'cvut',null,'low','Studentské ceny podle pravidel SÚZ ČVUT.','praha-menza-studentsky-dum','Přístup podle aktuálního provozu.','verified','2026-09-29','official',true,false,'Oficiální web SÚZ ČVUT'),
('c3000000-0000-4000-8000-000000000010','praha','Menza VŠE Italská','canteen','Univerzitní menza v areálu VŠE Žižkov.','Praktické stravování přímo u školy.','Italská 38, Praha 3',50.081000,14.440000,'Aktuální provoz a jídelníček ověřte na webu VŠE.','https://menza.vse.cz/','https://menza.vse.cz/','2026-09-29','2026-09-29','verified','approved',false,'vse',null,'low','Studentské ceny podle pravidel VŠE.','praha-menza-vse-italska','Přístup podle aktuálního provozu.','verified','2026-09-29','official',true,false,'Oficiální web VŠE'),
('c3000000-0000-4000-8000-000000000011','praha','Menza ČZU','canteen','Hlavní univerzitní menza v kampusu ČZU Suchdol.','Stravování v centru suchdolského kampusu.','Kamýcká 129, Praha-Suchdol',50.129400,14.374200,'Aktuální provoz a jídelníček ověřte na webu ČZU.','https://www.kam.czu.cz/','https://www.kam.czu.cz/','2026-09-29','2026-09-29','verified','approved',false,'czu',null,'low','Studentské ceny podle pravidel ČZU.','praha-menza-czu','Přístup podle aktuálního provozu.','verified','2026-09-29','official',true,false,'Oficiální web ČZU'),
('c3000000-0000-4000-8000-000000000012','praha','Kampus ČVUT Dejvice','student_service','Hlavní pražský kampus ČVUT s fakultami, knihovnou a studentskými službami.','Rozcestník nejdůležitějšího technického kampusu v Praze.','Technická, Praha 6',50.103500,14.391100,'Areál je přístupný podle provozu jednotlivých budov.','https://www.cvut.cz/','https://www.cvut.cz/','2026-09-29',null,'verified','approved',false,'cvut',null,'free',null,'praha-kampus-cvut-dejvice','Budovy mají vlastní pravidla vstupu.','verified','2026-09-29','official',true,false,'Oficiální web ČVUT'),
('c3000000-0000-4000-8000-000000000013','praha','Královská obora Stromovka','park','Rozsáhlý veřejný park vhodný k odpočinku i pohybu.','Zeleň a prostor pro pauzu mezi studiem.','Stromovka, Praha 7',50.104500,14.419000,'Veřejný park.','https://prague.eu/cs/objevujte/kralovska-obora-stromovka/','https://prague.eu/cs/objevujte/kralovska-obora-stromovka/','2026-09-29',null,'verified','approved',false,null,null,'free',null,'praha-park-stromovka','Respektujte návštěvní řád parku.','verified','2026-09-29','official',true,false,'Oficiální web Prague City Tourism'),
('c3000000-0000-4000-8000-000000000014','praha','Letenské sady','park','Veřejný park nad centrem Prahy.','Odpočinek, sport a výhled na město.','Letenské sady, Praha 7',50.097600,14.417300,'Veřejný park.','https://prague.eu/cs/objevujte/letenske-sady/','https://prague.eu/cs/objevujte/letenske-sady/','2026-09-29',null,'verified','approved',false,null,null,'free',null,'praha-park-letna','Respektujte návštěvní řád parku.','verified','2026-09-29','official',true,false,'Oficiální web Prague City Tourism'),
('c3000000-0000-4000-8000-000000000015','praha','Riegrovy sady','park','Městský park poblíž VŠE a hlavního nádraží.','Zeleň pro odpočinek v dosahu žižkovského kampusu.','Riegrovy sady, Praha 2',50.081900,14.441900,'Veřejný park.','https://prague.eu/cs/objevujte/riegrovy-sady/','https://prague.eu/cs/objevujte/riegrovy-sady/','2026-09-29',null,'verified','approved',false,null,null,'free',null,'praha-park-riegrovy-sady','Respektujte návštěvní řád parku.','verified','2026-09-29','official',true,false,'Oficiální web Prague City Tourism')
on conflict (id) do update set name=excluded.name,category=excluded.category,description=excluded.description,why_visit=excluded.why_visit,
  address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,opening_hours=excluded.opening_hours,
  website_url=excluded.website_url,source_url=excluded.source_url,last_verified_at=excluded.last_verified_at,
  opening_hours_verified_at=excluded.opening_hours_verified_at,verification_status='verified',status='approved',is_demo=false,
  university_id=excluded.university_id,faculty_id=excluded.faculty_id,price_level=excluded.price_level,
  student_discount=excluded.student_discount,source_external_id=excluded.source_external_id,access_conditions=excluded.access_conditions,
  source_sync_status='verified',source_checked_at=excluded.source_checked_at,origin='official',public_access=excluded.public_access,
  student_only=excluded.student_only,source_license=excluded.source_license,city_id='praha';

update public.places
set dedupe_key = 'official:' || source_external_id
where city_id='praha' and source_external_id like 'praha-%' and dedupe_key is null;

insert into public.city_configuration_audit(city_id,actor_id,action,previous_config,new_config)
select 'praha',null,'published','{"publicStatus":"draft","enabled":false}'::jsonb,
  '{"publicStatus":"published","enabled":true,"jobs":false,"offers":false,"verifiedAt":"2026-09-29"}'::jsonb
where not exists (
  select 1 from public.city_configuration_audit
  where city_id='praha' and action='published' and new_config->>'verifiedAt'='2026-09-29'
);
