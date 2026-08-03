-- Odděluje způsob monitoringu od posledního výsledku synchronizace.
-- Všechny aktivní fakultní zdroje se stahují; review režim pouze blokuje automatické publikování.

alter table public.content_sources add column if not exists monitoring_mode text;
update public.content_sources set monitoring_mode = case
  when parser_key in ('muni-is-periods','jamu-is-periods','vut-fit-html','vut-fsi-html','mendelu-pef-html') then 'automatic_publish'
  when sync_status = 'not_found' or parser_key in ('none','not-found-monitor') then 'not_found_monitored'
  else 'automatic_review'
end where monitoring_mode is null;
alter table public.content_sources alter column monitoring_mode set default 'automatic_review';
alter table public.content_sources alter column monitoring_mode set not null;
alter table public.content_sources drop constraint if exists content_sources_monitoring_mode_check;
alter table public.content_sources add constraint content_sources_monitoring_mode_check check (monitoring_mode in ('automatic_publish','automatic_review','not_found_monitored'));
alter table public.content_sources add column if not exists last_document_url text check (last_document_url is null or last_document_url ~ '^https://');
alter table public.link_checks add column if not exists final_url text check (final_url is null or final_url ~ '^https://');
alter table public.link_checks drop constraint if exists link_checks_status_check;
alter table public.link_checks add constraint link_checks_status_check check (status in ('ok','redirect','redirected','blocked','temporary_failure','broken','skipped'));

update public.content_sources set
  source_url = 'https://is.muni.cz/predmety/obdobi', official_domain = 'is.muni.cz', parser_key = 'muni-is-periods',
  enabled = true, refresh_interval = interval '1 day', monitoring_mode = 'automatic_publish', requires_review = false,
  confidence = 0.96, terms_note = 'Veřejný strukturovaný přehled harmonogramů období IS MUNI, mapovaný podle fakultních sloupců.',
  notes = 'Veřejný strukturovaný přehled harmonogramů období IS MUNI, mapovaný podle fakultních sloupců.'
where university_id = 'muni' and source_type = 'academic_calendar';

update public.content_sources set
  source_url = 'https://is.jamu.cz/predmety/obdobi', official_domain = 'is.jamu.cz', parser_key = 'jamu-is-periods',
  enabled = true, refresh_interval = interval '1 day', monitoring_mode = 'automatic_publish', requires_review = false,
  confidence = 0.96, terms_note = 'Veřejný strukturovaný přehled harmonogramů období IS JAMU, mapovaný podle fakultních sloupců.',
  notes = 'Veřejný strukturovaný přehled harmonogramů období IS JAMU, mapovaný podle fakultních sloupců.'
where university_id = 'jamu' and source_type = 'academic_calendar';

update public.content_sources set source_url = 'https://www.fit.vut.cz/study/calendar/', monitoring_mode = 'automatic_publish', enabled = true, requires_review = false, confidence = 0.96
where id = 'src-vut-fit';
update public.content_sources set source_url = 'https://www.fme.vutbr.cz/studenti/plan?degree=0&mode=0', monitoring_mode = 'automatic_publish', enabled = true, requires_review = false, confidence = 0.96
where id = 'src-vut-fsi';
update public.content_sources set monitoring_mode = 'automatic_publish', enabled = true, requires_review = false, confidence = 0.96
where id = 'src-mendelu-pef';

update public.content_sources set
  source_url = 'https://www.vetuni.cz/Rozpis_vyuky_pro_akademicky_rok', official_domain = 'vetuni.cz', format = 'html', parser_key = 'linked-document-review',
  monitoring_mode = 'automatic_review', enabled = true, refresh_interval = interval '1 day', requires_review = true, confidence = 0.60,
  terms_note = 'Stabilní oficiální rozcestník každoročně odkazuje na společný PDF rozpis výuky VETUNI.'
where id in ('src-vetuni-fvl','src-vetuni-fvhe');

update public.content_sources set monitoring_mode = 'automatic_review', enabled = true, refresh_interval = interval '1 day', requires_review = true
where source_type = 'academic_calendar' and id not in ('src-vut-fit','src-vut-fsi','src-mendelu-pef','src-mendelu-frrms') and university_id not in ('muni','jamu');

update public.content_sources set parser_key = 'not-found-monitor', monitoring_mode = 'not_found_monitored', enabled = true,
  refresh_interval = interval '1 day', requires_review = true, confidence = 0,
  terms_note = 'Veřejný harmonogram nebyl nalezen; oficiální stránka se denně kontroluje na nový dokument.'
where id = 'src-mendelu-frrms';

-- Každá aktivní fakulta musí mít aktivní monitorovaný zdroj.
update public.content_sources s set enabled = true
where s.source_type = 'academic_calendar' and exists (select 1 from public.faculties f where f.id = s.faculty_id and f.is_active);

create index if not exists content_sources_monitoring_due_idx on public.content_sources(monitoring_mode, enabled, last_checked_at)
where source_type = 'academic_calendar';

grant select on public.academic_events to anon, authenticated;
grant select on public.cities, public.university_cities, public.campuses, public.offer_cities to anon, authenticated;
revoke select on public.service_requests, public.source_review_queue, public.content_sources from anon;
