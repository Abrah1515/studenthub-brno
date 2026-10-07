-- Počáteční, idempotentní import budoucích akcí z veřejného kalendáře OU.
-- Jde o vlastní stručná shrnutí a odkazy na oficiální zdroj, nikoli kopie článků.

insert into public.community_events
  (id,city_id,title,category,starts_at,ends_at,venue,description,is_free,price_amount,currency,event_url,image_url,
   duplicate_fingerprint,status,organizer,source_type,source_url,source_external_id,last_verified_at,source_sync_status,
   university_id,faculty_id,attendance_mode)
values
('b4070000-0000-4000-8000-000000000003','ostrava','Každý žák (se) počítá','Studium a vzdělávání','2026-11-07 09:00:00+01','2026-11-07 17:00:00+01','Pedagogická fakulta OU, budova SA','Veřejná vzdělávací akce Katedry matematiky s didaktikou. Program a registraci ověřte na oficiálním detailu.',false,null,'CZK','https://pdf.osu.cz/kmd/33617/kazdy-zak-se-pocita/',null,md5('osu-kazdy-zak-2026')||md5('osu-kazdy-zak-2026-source'),'published','Pedagogická fakulta Ostravské univerzity','external','https://www.osu.cz/calendar/','osu-kazdy-zak-2026','2026-10-07 02:00:00+02','verified','osu','osu-pdf','in_person')
on conflict (city_id,source_external_id) where source_type='external' and source_external_id is not null do update set
  title=excluded.title,category=excluded.category,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
  venue=excluded.venue,description=excluded.description,is_free=excluded.is_free,price_amount=excluded.price_amount,
  event_url=excluded.event_url,organizer=excluded.organizer,source_url=excluded.source_url,
  last_verified_at=excluded.last_verified_at,source_sync_status='verified',university_id=excluded.university_id,
  faculty_id=excluded.faculty_id,attendance_mode=excluded.attendance_mode;
