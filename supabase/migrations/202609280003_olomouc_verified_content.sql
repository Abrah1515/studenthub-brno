-- Druhá fáze Olomouce: ověřený akademický katalog, termíny, veřejné akce a místa.
-- Město zůstává neveřejné; data jsou připravená pro interní kontrolu a pozdější spuštění.

insert into public.universities (id,slug,name,short_name,city,website_url,is_active,last_verified_at)
values ('upol','upol','Univerzita Palackého v Olomouci','UP','Olomouc','https://www.upol.cz/',true,'2026-09-28 00:00:00+02')
on conflict (id) do update set slug=excluded.slug,name=excluded.name,short_name=excluded.short_name,city=excluded.city,
  website_url=excluded.website_url,is_active=true,last_verified_at=excluded.last_verified_at;

insert into public.university_cities (university_id,city_id,is_primary)
values ('upol','olomouc',true)
on conflict (university_id,city_id) do update set is_primary=excluded.is_primary;

insert into public.faculties (id,university_id,slug,name,short_name,official_url,is_active,last_verified_at)
values
('upol-cmtf','upol','upol-cmtf','Cyrilometodějská teologická fakulta','CMTF','https://www.cmtf.upol.cz/',true,'2026-09-28 00:00:00+02'),
('upol-lf','upol','upol-lf','Lékařská fakulta','LF','https://www.lf.upol.cz/',true,'2026-09-28 00:00:00+02'),
('upol-ff','upol','upol-ff','Filozofická fakulta','FF','https://www.ff.upol.cz/',true,'2026-09-28 00:00:00+02'),
('upol-prf','upol','upol-prf','Přírodovědecká fakulta','PřF','https://www.prf.upol.cz/',true,'2026-09-28 00:00:00+02'),
('upol-pdf','upol','upol-pdf','Pedagogická fakulta','PdF','https://www.pdf.upol.cz/',true,'2026-09-28 00:00:00+02'),
('upol-ftk','upol','upol-ftk','Fakulta tělesné kultury','FTK','https://ftk.upol.cz/',true,'2026-09-28 00:00:00+02'),
('upol-pf','upol','upol-pf','Právnická fakulta','PF','https://www.pf.upol.cz/',true,'2026-09-28 00:00:00+02'),
('upol-fzv','upol','upol-fzv','Fakulta zdravotnických věd','FZV','https://www.fzv.upol.cz/',true,'2026-09-28 00:00:00+02')
on conflict (id) do update set university_id=excluded.university_id,slug=excluded.slug,name=excluded.name,short_name=excluded.short_name,
  official_url=excluded.official_url,is_active=true,last_verified_at=excluded.last_verified_at;

insert into public.content_sources
  (id,university_id,faculty_id,city_id,source_type,source_url,official_domain,format,parser_key,enabled,refresh_interval,
   sync_status,terms_note,academic_year,confidence,requires_review,notes,source_document_title,monitoring_mode,next_check_at)
select
  'src-'||f.id,'upol',f.id,'olomouc','academic_calendar',
  case when f.id='upol-ff' then 'https://www.ff.upol.cz/studenti/studium/harmonogram-ak-roku/' else 'https://www.upol.cz/studenti/studium/harmonogram-akademickeho-roku/' end,
  case when f.id='upol-ff' then 'ff.upol.cz' else 'upol.cz' end,'html','generic-academic-html',true,interval '9 hours','idle',
  'Oficiální veřejný harmonogram UP pro akademický rok 2026/2027; změny zůstávají v ruční kontrole.',
  '2026/2027',0.80,true,'Strukturovaná veřejná stránka. Automatika nesmí publikovat změny bez kontroly editorem.',
  'Harmonogram akademického roku 2026/2027', 'automatic_review', now()
from public.faculties f where f.university_id='upol'
on conflict (id) do update set city_id='olomouc',source_url=excluded.source_url,official_domain=excluded.official_domain,
  format='html',parser_key='generic-academic-html',enabled=true,refresh_interval=interval '9 hours',academic_year='2026/2027',
  confidence=0.80,requires_review=true,notes=excluded.notes,terms_note=excluded.terms_note,
  source_document_title=excluded.source_document_title,monitoring_mode='automatic_review',next_check_at=least(public.content_sources.next_check_at,now());

with source_data(faculty_id,external_id,title,description,starts_at,ends_at,semester) as (values
('upol-cmtf','upol-cmtf-winter-teaching-2026','Výuka v zimním semestru CMTF','Prezenční výuka podle centrálního harmonogramu UP.','2026-09-21 00:00:00+02'::timestamptz,'2026-12-18 23:59:59+01'::timestamptz,'autumn'),
('upol-cmtf','upol-cmtf-summer-teaching-2027','Výuka v letním semestru CMTF','Prezenční výuka podle centrálního harmonogramu UP.','2027-02-08 00:00:00+01','2027-05-07 23:59:59+02','spring'),
('upol-lf','upol-lf-winter-teaching-2026','Výuka v zimním semestru LF UP','Výuka podle centrálního harmonogramu UP; konkrétní ročníky mohou mít fakultní rozpis.','2026-09-07 00:00:00+02','2027-02-14 23:59:59+01','autumn'),
('upol-lf','upol-lf-summer-teaching-2027','Výuka v letním semestru LF UP','Výuka podle centrálního harmonogramu UP; konkrétní ročníky mohou mít fakultní rozpis.','2027-01-18 00:00:00+01','2027-06-06 23:59:59+02','spring'),
('upol-ff','upol-ff-winter-teaching-2026','Výuka v zimním semestru FF UP','Prezenční výuka podle aktuálního fakultního harmonogramu.','2026-09-21 00:00:00+02','2026-12-18 23:59:59+01','autumn'),
('upol-ff','upol-ff-summer-teaching-2027','Výuka v letním semestru FF UP','Prezenční výuka podle aktuálního fakultního harmonogramu.','2027-02-08 00:00:00+01','2027-05-07 23:59:59+02','spring'),
('upol-prf','upol-prf-winter-teaching-2026','Výuka v zimním semestru PřF UP','Prezenční výuka podle centrálního harmonogramu UP.','2026-09-21 00:00:00+02','2026-12-18 23:59:59+01','autumn'),
('upol-prf','upol-prf-summer-teaching-2027','Výuka v letním semestru PřF UP','Prezenční výuka podle centrálního harmonogramu UP.','2027-02-08 00:00:00+01','2027-05-07 23:59:59+02','spring'),
('upol-pdf','upol-pdf-winter-teaching-2026','Výuka v zimním semestru PdF UP','Prezenční výuka podle centrálního harmonogramu UP.','2026-09-21 00:00:00+02','2026-12-18 23:59:59+01','autumn'),
('upol-pdf','upol-pdf-summer-teaching-2027','Výuka v letním semestru PdF UP','Prezenční výuka podle centrálního harmonogramu UP.','2027-02-08 00:00:00+01','2027-05-07 23:59:59+02','spring'),
('upol-ftk','upol-ftk-winter-teaching-2026','Výuka v zimním semestru FTK UP','Prezenční výuka podle centrálního harmonogramu UP.','2026-09-21 00:00:00+02','2026-12-18 23:59:59+01','autumn'),
('upol-ftk','upol-ftk-summer-teaching-2027','Výuka v letním semestru FTK UP','Prezenční výuka podle centrálního harmonogramu UP.','2027-02-08 00:00:00+01','2027-05-07 23:59:59+02','spring'),
('upol-pf','upol-pf-winter-teaching-2026','Výuka v zimním semestru PF UP','Prezenční výuka podle centrálního harmonogramu UP.','2026-09-21 00:00:00+02','2026-12-18 23:59:59+01','autumn'),
('upol-pf','upol-pf-summer-teaching-2027','Výuka v letním semestru PF UP','Prezenční výuka podle centrálního harmonogramu UP.','2027-02-15 00:00:00+01','2027-05-14 23:59:59+02','spring'),
('upol-fzv','upol-fzv-winter-teaching-2026','Výuka v zimním semestru FZV UP','Prezenční výuka podle centrálního harmonogramu UP.','2026-09-14 00:00:00+02','2027-01-08 23:59:59+01','autumn'),
('upol-fzv','upol-fzv-summer-teaching-2027','Výuka v letním semestru FZV UP','Prezenční výuka podle centrálního harmonogramu UP.','2027-02-08 00:00:00+01','2027-05-21 23:59:59+02','spring')
), prepared as (
  select sd.*,f.short_name,s.id source_id,s.source_url,
    ('71'||substr(md5(sd.external_id),1,6)||'-'||substr(md5(sd.external_id),7,4)||'-4'||substr(md5(sd.external_id),11,3)||'-8'||substr(md5(sd.external_id),14,3)||'-'||substr(md5(sd.external_id),17,12))::uuid id
  from source_data sd join public.faculties f on f.id=sd.faculty_id join public.content_sources s on s.id='src-'||sd.faculty_id
)
insert into public.academic_events
  (id,title,description,category,school,faculty,starts_at,ends_at,source_name,source_url,source_updated_at,status,is_demo,
   external_id,source_id,all_day,timezone,academic_year,source_hash,confidence,last_verified_at,verification_status,change_state,
   is_cancelled,manual_override,duplicate_fingerprint,scope_type,university_id,faculty_id,city_id,source_document_title,semester)
select id,title,description,'teaching','UP',short_name,starts_at,ends_at,'Oficiální harmonogram UP',source_url,'2026-09-25 00:00:00+02',
  'approved',false,external_id,source_id,true,'Europe/Prague','2026/2027',md5(external_id)||md5(external_id||'source'),0.98,
  '2026-09-28 00:00:00+02','verified','unchanged',false,false,md5(external_id)||md5(external_id||'event'),
  'faculty','upol',faculty_id,'olomouc','Harmonogram akademického roku 2026/2027',semester
from prepared
on conflict (id) do update set title=excluded.title,description=excluded.description,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
  source_url=excluded.source_url,source_updated_at=excluded.source_updated_at,last_verified_at=excluded.last_verified_at,
  verification_status='verified',academic_year='2026/2027',city_id='olomouc',university_id='upol',faculty_id=excluded.faculty_id;

with central(external_id,title,description,category,starts_at,ends_at) as (values
('upol-academic-year-2026','Akademický rok 2026/2027 na UP','Oficiální období akademického roku Univerzity Palackého.','other'::public.event_category,'2026-09-01 00:00:00+02'::timestamptz,'2027-08-31 23:59:59+02'::timestamptz),
('upol-rector-holiday-december-23-2026','Rektorské volno na UP','Rektorské volno 23. prosince 2026.','dean_rector_leave','2026-12-23 00:00:00+01','2026-12-23 23:59:59+01'),
('upol-rector-holiday-december-28-2026','Rektorské volno na UP','Rektorské volno od 28. do 31. prosince 2026.','dean_rector_leave','2026-12-28 00:00:00+01','2026-12-31 23:59:59+01'),
('upol-academic-week-2027','Akademický týden UP','Akademický týden Univerzity Palackého.','faculty_event','2027-02-15 00:00:00+01','2027-02-21 23:59:59+01'),
('upol-open-day-november-2026','Den otevřených dveří UP','Celouniverzitní den otevřených dveří.','faculty_event','2026-11-27 08:00:00+01','2026-11-27 14:00:00+01'),
('upol-open-day-january-2027','Den otevřených dveří UP','Celouniverzitní den otevřených dveří.','faculty_event','2027-01-23 09:00:00+01','2027-01-23 14:00:00+01')
), prepared as (
 select central.*,('72'||substr(md5(external_id),1,6)||'-'||substr(md5(external_id),7,4)||'-4'||substr(md5(external_id),11,3)||'-8'||substr(md5(external_id),14,3)||'-'||substr(md5(external_id),17,12))::uuid id from central
)
insert into public.academic_events
  (id,title,description,category,school,faculty,starts_at,ends_at,source_name,source_url,source_updated_at,status,is_demo,
   external_id,all_day,timezone,academic_year,source_hash,confidence,last_verified_at,verification_status,change_state,is_cancelled,
   manual_override,duplicate_fingerprint,scope_type,university_id,faculty_id,city_id,source_document_title,semester)
select id,title,description,category,'UP','Všechny fakulty',starts_at,ends_at,'Oficiální harmonogram UP',
  'https://www.upol.cz/studenti/studium/harmonogram-akademickeho-roku/','2026-09-25 00:00:00+02','approved',false,
  external_id,(starts_at::time='00:00:00'), 'Europe/Prague','2026/2027',md5(external_id)||md5(external_id||'source'),0.98,
  '2026-09-28 00:00:00+02','verified','unchanged',false,false,md5(external_id)||md5(external_id||'event'),
  'university','upol',null,'olomouc','Harmonogram akademického roku 2026/2027','year_round'
from prepared
on conflict (id) do update set title=excluded.title,description=excluded.description,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
  last_verified_at=excluded.last_verified_at,verification_status='verified',city_id='olomouc',university_id='upol';

insert into public.community_events
  (id,city_id,title,category,starts_at,ends_at,venue,description,is_free,price_amount,currency,event_url,image_url,
   duplicate_fingerprint,status,organizer,source_type,source_url,source_external_id,last_verified_at,source_sync_status,
   university_id,faculty_id,attendance_mode)
values
('93222222-3333-4333-8333-333333333301','olomouc','Pastiche Filmz: Moonlight','Kultura','2026-09-29 19:00:00+02','2026-09-29 21:30:00+02','Umělecké centrum UP, Univerzitní 3','Projekce filmu Moonlight v programu studentského filmového klubu. Vlastní shrnutí StudentHubu podle veřejného kalendáře UP.',true,null,'CZK','https://www.upol.cz/nc/kalendar/akce/clanek/pastiche-filmz-moonlight/',null,md5('upol-pastiche-moonlight-2026')||md5('upol-pastiche-moonlight-2026-source'),'published','Pastiche Filmz','external','https://www.upol.cz/nc/kalendar/akce/clanek/pastiche-filmz-moonlight/','upol-pastiche-moonlight-2026','2026-09-28 00:00:00+02','verified','upol','upol-ff','in_person'),
('93222222-3333-4333-8333-333333333302','olomouc','Fair UP – týden péče o tělo, duši i společnost','Wellbeing a zdraví','2026-10-05 09:00:00+02','2026-10-09 20:00:00+02','Pracoviště Univerzity Palackého v Olomouci','Pět dní přednášek, workshopů, konzultací a dalších aktivit pro studující, zaměstnance i veřejnost. Vlastní shrnutí StudentHubu.',true,null,'CZK','https://www.upol.cz/nc/kalendar/akce/clanek/fair-up-tyden-pece-o-telo-dusi-i-spolecnost/',null,md5('upol-fair-up-2026')||md5('upol-fair-up-2026-source'),'published','Univerzita Palackého v Olomouci','external','https://www.upol.cz/nc/kalendar/akce/clanek/fair-up-tyden-pece-o-telo-dusi-i-spolecnost/','upol-fair-up-2026','2026-09-28 00:00:00+02','verified','upol',null,'in_person'),
('93222222-3333-4333-8333-333333333303','olomouc','Nábor do registru dárců kostní dřeně','Dobrovolnictví','2026-10-05 12:00:00+02','2026-10-05 17:00:00+02','Nádvoří Tereziánské zbrojnice, Biskupské náměstí 1','Informační a náborová akce registru dárců pro zájemce ve věku 18–35 let. Vlastní shrnutí StudentHubu podle veřejného kalendáře UP.',true,null,'CZK','https://www.upol.cz/nc/kalendar/akce/clanek/pomozme-nejen-dvanactiletemu-ondrovi-nabor-do-registru-darcu-kostni-drene/',null,md5('upol-donor-registry-2026')||md5('upol-donor-registry-2026-source'),'published','Univerzita Palackého a registr dárců','external','https://www.upol.cz/nc/kalendar/akce/clanek/pomozme-nejen-dvanactiletemu-ondrovi-nabor-do-registru-darcu-kostni-drene/','upol-donor-registry-2026','2026-09-28 00:00:00+02','verified','upol',null,'in_person'),
('93222222-3333-4333-8333-333333333304','olomouc','FFest 2026','Studentské spolky','2026-11-06 13:00:00+01','2026-11-17 22:00:00+01','Filozofická fakulta UP a partnerská místa v Olomouci','Třetí ročník festivalu studentské kreativity Filozofické fakulty UP. Konkrétní program a místa uvádí pořadatel. Vlastní shrnutí StudentHubu.',true,null,'CZK','https://ffest.upol.cz/',null,md5('upol-ffest-2026')||md5('upol-ffest-2026-source'),'published','Filozofická fakulta UP','external','https://ffest.upol.cz/','upol-ffest-2026','2026-09-28 00:00:00+02','verified','upol','upol-ff','in_person'),
('93222222-3333-4333-8333-333333333305','olomouc','UP Business Camp 2026','Kariéra a brigády','2026-11-12 09:00:00+01','2026-11-12 17:30:00+01','Pevnost poznání, 17. listopadu 7','Podnikatelská konference s přednáškami a praktickým programem. Podmínky registrace a cenu ověřte na detailu pořadatele. Vlastní shrnutí StudentHubu.',false,null,'CZK','https://www.upol.cz/nc/kalendar/akce/clanek/up-business-camp-2026/',null,md5('upol-business-camp-2026')||md5('upol-business-camp-2026-source'),'published','Vědeckotechnický park UP','external','https://www.upol.cz/nc/kalendar/akce/clanek/up-business-camp-2026/','upol-business-camp-2026','2026-09-28 00:00:00+02','verified','upol',null,'in_person'),
('93222222-3333-4333-8333-333333333306','olomouc','PAF Olomouc 2026 – Bestiary','Kultura','2026-12-03 19:00:00+01','2026-12-06 21:00:00+01','Umělecké centrum UP, Univerzitní 3','Festival animovaného filmu a současného umění s tématem Bestiary. Vlastní shrnutí StudentHubu podle veřejného detailu akce.',false,null,'CZK','https://www.upol.cz/nc/kalendar/akce/clanek/paf-olomouc-2026-bestiary/',null,md5('upol-paf-2026')||md5('upol-paf-2026-source'),'published','PAF','external','https://www.upol.cz/nc/kalendar/akce/clanek/paf-olomouc-2026-bestiary/','upol-paf-2026','2026-09-28 00:00:00+02','verified','upol','upol-ff','in_person'),
('93222222-3333-4333-8333-333333333307','olomouc','Adventní dílny v Pevnosti poznání','Workshop a přednáška','2026-12-05 09:00:00+01','2026-12-27 17:00:00+01','Pevnost poznání, 17. listopadu 7','Tvořivé adventní dílny s hravým a vědeckým přesahem. Konkrétní dny a vstupné ověřte v programu pořadatele. Vlastní shrnutí StudentHubu.',false,null,'CZK','https://www.upol.cz/nc/kalendar/akce/clanek/adventni-dilny/',null,md5('upol-advent-workshops-2026')||md5('upol-advent-workshops-2026-source'),'published','Pevnost poznání','external','https://www.upol.cz/nc/kalendar/akce/clanek/adventni-dilny/','upol-advent-workshops-2026','2026-09-28 00:00:00+02','verified','upol','upol-prf','in_person')
on conflict (city_id,source_external_id) where source_type='external' and source_external_id is not null do update set
  title=excluded.title,category=excluded.category,starts_at=excluded.starts_at,ends_at=excluded.ends_at,venue=excluded.venue,
  description=excluded.description,is_free=excluded.is_free,price_amount=excluded.price_amount,event_url=excluded.event_url,
  organizer=excluded.organizer,source_url=excluded.source_url,last_verified_at=excluded.last_verified_at,source_sync_status='verified',
  university_id=excluded.university_id,faculty_id=excluded.faculty_id,attendance_mode=excluded.attendance_mode;

insert into public.places
  (id,city_id,name,category,description,why_visit,address,latitude,longitude,opening_hours,website_url,source_url,
   last_verified_at,opening_hours_verified_at,verification_status,status,is_demo,university_id,faculty_id,price_level,
   student_discount,source_external_id,access_conditions,source_sync_status,source_checked_at,origin,public_access,student_only,source_license)
values
('62222222-3333-4333-8333-333333333301','olomouc','Hlavní menza UP','canteen','Hlavní univerzitní menza v kampusu Envelopa.','Cenově dostupné stravování poblíž fakult a kolejí.','17. listopadu 54, Olomouc',49.591970,17.264570,'Aktuální provoz a jídelníček ověřte na webu SKM.','https://skm.upol.cz/studenti/stravovani/','https://mapy.upol.cz/','2026-09-28 00:00:00+02','2026-09-28 00:00:00+02','verified','approved',false,'upol',null,'low','Studentské ceny podle pravidel SKM UP.','upol-menza-17-listopadu','Veřejnost a studenti podle aktuálního provozu.','verified','2026-09-28 00:00:00+02','official',true,false,'Oficiální mapa a web UP'),
('62222222-3333-4333-8333-333333333302','olomouc','Menza Josefa Jařaba','canteen','Univerzitní menza a stravovací zařízení u kolejí na Šmeralově ulici.','Obědové zázemí v hlavním studentském areálu.','Šmeralova 6, Olomouc',49.593150,17.266530,'Aktuální provoz a jídelníček ověřte na webu SKM.','https://skm.upol.cz/studenti/stravovani/','https://mapy.upol.cz/','2026-09-28 00:00:00+02','2026-09-28 00:00:00+02','verified','approved',false,'upol',null,'low','Studentské ceny podle pravidel SKM UP.','upol-menza-josefa-jaraba','Veřejnost a studenti podle aktuálního provozu.','verified','2026-09-28 00:00:00+02','official',true,false,'Oficiální mapa a web UP'),
('62222222-3333-4333-8333-333333333303','olomouc','Menza Křížkovského','canteen','Menší univerzitní menza v hlavní budově UP.','Stravování přímo u rektorátu a historického centra.','Křížkovského 8, Olomouc',49.595730,17.257930,'Aktuální provoz a jídelníček ověřte na webu SKM.','https://skm.upol.cz/studenti/stravovani/','https://mapy.upol.cz/','2026-09-28 00:00:00+02','2026-09-28 00:00:00+02','verified','approved',false,'upol',null,'low','Studentské ceny podle pravidel SKM UP.','upol-menza-krizkovskeho','Veřejnost a studenti podle aktuálního provozu.','verified','2026-09-28 00:00:00+02','official',true,false,'Oficiální mapa a web UP'),
('62222222-3333-4333-8333-333333333304','olomouc','Ústřední knihovna UP – Zbrojnice','library','Ústřední univerzitní knihovna v Tereziánské zbrojnici.','Studijní místa, knihovní služby a nonstop noční studovna.','Biskupské náměstí 1, Olomouc',49.595720,17.259870,'Noční studovna 0–24; provoz ostatních služeb ověřte na webu.','https://www.knihovna.upol.cz/sluzby/','https://mapy.upol.cz/','2026-09-28 00:00:00+02','2026-09-28 00:00:00+02','verified','approved',false,'upol',null,'free','Knihovní služby podle registrace čtenáře.','upol-library-zbrojnice','Noční studovna je přístupná podle pravidel Knihovny UP.','verified','2026-09-28 00:00:00+02','official',true,false,'Oficiální mapa a web UP'),
('62222222-3333-4333-8333-333333333305','olomouc','Noční studovna Zbrojnice','study_room','Samostatně zvýrazněná nonstop studovna v ústřední knihovně.','Možnost studovat nepřetržitě i mimo běžnou otevírací dobu knihovny.','Biskupské náměstí 1, Olomouc',49.595720,17.259870,'Denně 0–24.','https://www.knihovna.upol.cz/sluzby/','https://www.knihovna.upol.cz/sluzby/','2026-09-28 00:00:00+02','2026-09-28 00:00:00+02','verified','approved',false,'upol',null,'free',null,'upol-night-study-zbrojnice','Vstup podle pravidel Knihovny UP.','verified','2026-09-28 00:00:00+02','official',false,true,'Oficiální web Knihovny UP'),
('62222222-3333-4333-8333-333333333306','olomouc','Envelopa Hub','coworking','Univerzitní prostor pro spolupráci, podnikání a setkávání.','Pracovní a komunitní zázemí v kampusu Envelopa.','tř. 17. listopadu 12, Olomouc',49.592520,17.263930,'Aktuální program a přístup ověřte na webu provozovatele.','https://www.vtpup.cz/','https://mapy.upol.cz/','2026-09-28 00:00:00+02','2026-09-28 00:00:00+02','verified','approved',false,'upol',null,'free',null,'upol-envelopa-hub','Přístup se může lišit podle programu a rezervace.','verified','2026-09-28 00:00:00+02','official',true,false,'Oficiální mapa UP'),
('62222222-3333-4333-8333-333333333307','olomouc','Kariérní a poradenské centrum UP','counselling','Univerzitní poradenské služby pro studium, kariéru a osobní rozvoj.','Jedno kontaktní místo pro studenty, kteří řeší studijní nebo kariérní otázky.','Křížkovského 8, Olomouc',49.595730,17.257930,'Konzultace a aktuální kontakty ověřte na webu centra.','https://kariernicentrum.upol.cz/','https://mapy.upol.cz/','2026-09-28 00:00:00+02','2026-09-28 00:00:00+02','verified','approved',false,'upol',null,'free',null,'upol-career-counselling','Část služeb může vyžadovat objednání.','verified','2026-09-28 00:00:00+02','official',false,true,'Oficiální mapa a web UP'),
('62222222-3333-4333-8333-333333333308','olomouc','Centrum podpory studentů se specifickými potřebami','counselling','Podpora studentů se specifickými potřebami a konzultační služby.','Pomoc s přístupností studia a individuálním nastavením podpory.','Žižkovo náměstí 5, Olomouc',49.594500,17.264180,'Návštěvu domluvte podle aktuálních kontaktů centra.','https://cps.upol.cz/','https://cps.upol.cz/ostatni/bezbarierova-univerzita/','2026-09-28 00:00:00+02','2026-09-28 00:00:00+02','verified','approved',false,'upol','upol-pdf','free',null,'upol-cps-specific-needs','Služby jsou určeny zejména studentům UP; zpravidla je vhodné objednání.','verified','2026-09-28 00:00:00+02','official',false,true,'Oficiální web UP'),
('62222222-3333-4333-8333-333333333309','olomouc','Sportovní hala UP','sport','Univerzitní sportovní hala a zázemí Akademik sport centra.','Sportovní aktivity a kurzy poblíž kolejí.','U sportovní haly 2, Olomouc',49.601290,17.247150,'Rozpis a přístup ověřte u Akademik sport centra.','https://ascup.upol.cz/','https://mapy.upol.cz/','2026-09-28 00:00:00+02','2026-09-28 00:00:00+02','verified','approved',false,'upol','upol-ftk','varies','Kurzy UP mohou mít studentské podmínky.','upol-sports-hall','Vstup podle rozpisu a rezervací.','verified','2026-09-28 00:00:00+02','official',true,false,'Oficiální mapa UP'),
('62222222-3333-4333-8333-333333333310','olomouc','Správa kolejí a menz UP','student_service','Kontaktní pracoviště pro ubytování, stravování a kolejní služby.','Řešení ubytování, kolejí, plateb a provozních dotazů studentů.','Šmeralova 12, Olomouc',49.593300,17.267230,'Po–Čt 7:00–10:00 a 12:00–14:30, Pá 7:00–11:30; prázdninový režim se liší.','https://skm.upol.cz/kontakty-skm/','https://mapy.upol.cz/','2026-09-28 00:00:00+02','2026-09-28 00:00:00+02','verified','approved',false,'upol',null,'free',null,'upol-dorm-services','Úřední hodiny se v době prázdnin mění.','verified','2026-09-28 00:00:00+02','official',false,true,'Oficiální mapa a web UP'),
('62222222-3333-4333-8333-333333333311','olomouc','FreshUP PřF','cafe','Univerzitní bistro v budově Přírodovědecké fakulty.','Rychlé občerstvení a prostor pro krátké setkání v kampusu Envelopa.','tř. 17. listopadu 12, Olomouc',49.592520,17.263930,'Aktuální provoz ověřte na webu SKM.','https://skm.upol.cz/studenti/stravovani/','https://mapy.upol.cz/','2026-09-28 00:00:00+02','2026-09-28 00:00:00+02','verified','approved',false,'upol','upol-prf','low','Studentské ceny podle pravidel SKM UP.','upol-freshup-prf','Veřejnost a studenti podle aktuálního provozu.','verified','2026-09-28 00:00:00+02','official',true,false,'Oficiální mapa a web UP'),
('62222222-3333-4333-8333-333333333312','olomouc','Bezručovy sady','park','Rozsáhlý městský park pod historickými hradbami.','Klidná zeleň poblíž univerzitních budov vhodná k odpočinku mezi výukou.','Bezručovy sady, Olomouc',49.592000,17.261100,'Veřejný park.','https://tourism.olomouc.eu/','https://www.mapy.olomouc.eu/','2026-09-28 00:00:00+02','2026-09-28 00:00:00+02','verified','approved',false,null,null,'free',null,'olomouc-bezrucovy-sady','Veřejně přístupný městský park.','verified','2026-09-28 00:00:00+02','official',true,false,'Mapový portál statutárního města Olomouce'),
('62222222-3333-4333-8333-333333333313','olomouc','Veřejné WC Pavelčákova','public_toilet','Veřejné toalety uvedené v oficiálních městských turistických mapách.','Praktické zázemí v centru města.','Pavelčákova, Olomouc',49.592230,17.248330,'Aktuální dostupnost ověřte na místě nebo v mapovém portálu města.','https://www.mapy.olomouc.eu/','https://www.olomouc.eu/portal/mapovy-portal','2026-09-28 00:00:00+02',null,'verified','approved',false,null,null,'low',null,'olomouc-public-toilet-pavelcakova','Veřejné WC; provoz se může měnit.','verified','2026-09-28 00:00:00+02','official',true,false,'Mapový portál statutárního města Olomouce')
on conflict (id) do update set name=excluded.name,category=excluded.category,description=excluded.description,why_visit=excluded.why_visit,
  address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,opening_hours=excluded.opening_hours,
  website_url=excluded.website_url,source_url=excluded.source_url,last_verified_at=excluded.last_verified_at,
  opening_hours_verified_at=excluded.opening_hours_verified_at,verification_status='verified',status='approved',is_demo=false,
  university_id=excluded.university_id,faculty_id=excluded.faculty_id,price_level=excluded.price_level,
  student_discount=excluded.student_discount,source_external_id=excluded.source_external_id,access_conditions=excluded.access_conditions,
  source_sync_status='verified',source_checked_at=excluded.source_checked_at,origin='official',public_access=excluded.public_access,
  student_only=excluded.student_only,source_license=excluded.source_license,city_id='olomouc';

update public.cities set
  enabled=false,public_status='draft',
  module_config='{"calendar":true,"places":true,"community":true,"buddy":true,"marketplace":true,"housing":true,"jobs":false,"chat":true,"watcher":true,"settings":true,"offers":false}'::jsonb,
  brand_config=brand_config||'{"seoTitle":"StudentHub Olomouc – připravujeme","seoDescription":"Připravovaná městská edice s ověřenými termíny, místy a komunitními funkcemi."}'::jsonb,
  updated_at=now()
where id='olomouc';

insert into public.city_configuration_audit(city_id,actor_id,action,previous_config,new_config)
select 'olomouc',null,'updated','{"phase":1,"modules":"disabled"}'::jsonb,
  jsonb_build_object('phase',2,'publicStatus','draft','enabled',false,'jobs',false,'verifiedAt','2026-09-28')
where not exists (
  select 1 from public.city_configuration_audit where city_id='olomouc' and new_config->>'phase'='2'
);

drop policy if exists "public reads active universities" on public.universities;
create policy "public reads active universities" on public.universities for select to anon,authenticated using (
  is_active and exists (
    select 1 from public.university_cities uc join public.cities c on c.id=uc.city_id
    where uc.university_id=universities.id and c.enabled and c.public_status='published'
  )
);
drop policy if exists "public reads active faculties" on public.faculties;
create policy "public reads active faculties" on public.faculties for select to anon,authenticated using (
  is_active and exists (
    select 1 from public.university_cities uc join public.cities c on c.id=uc.city_id
    where uc.university_id=faculties.university_id and c.enabled and c.public_status='published'
  )
);

comment on column public.cities.module_config is
  'Olomouc phase 2 modules are prepared internally, but every public route still requires enabled=true and public_status=published.';
