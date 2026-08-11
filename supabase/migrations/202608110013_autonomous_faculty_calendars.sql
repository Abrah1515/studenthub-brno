-- Autonomous discovery of current faculty calendars. Existing published events stay intact;
-- changed sources are only reset so the next scheduled run parses the current document.
update public.content_sources
set refresh_interval = interval '9 hours',
    next_check_at = least(coalesce(next_check_at, now()), now())
where source_type = 'academic_calendar';

update public.content_sources
set source_url = 'https://www.vut.cz/uredni-deska/vnitrni-legislativa-fekt/rozhodnuti-s8',
    official_domain = 'vut.cz',
    parser_key = 'linked-document-auto',
    monitoring_mode = 'automatic_publish',
    requires_review = false,
    confidence = 0.96,
    terms_note = 'Oficialni seznam rozhodnuti FEKT; system vyhleda aktualni casovy plan a projde detail az k PDF priloze.',
    notes = 'Autonomni dvouurovnove dohledani aktualniho oficialniho PDF.',
    etag = null,
    last_modified = null,
    content_hash = null,
    normalized_hash = null,
    last_document_url = null,
    sync_status = 'idle',
    next_check_at = now()
where id = 'src-vut-fekt';

update public.content_sources
set source_url = case id
      when 'src-vut-fch' then 'https://www.vut.cz/uredni-deska/vnitrni-legislativa-fch/vnitrni-normy-sp103'
      when 'src-vut-fp' then 'https://www.vut.cz/uredni-deska/vnitrni-legislativa-fp/rozhodnuti-s56'
    end,
    official_domain = 'vut.cz',
    parser_key = 'linked-document-auto',
    monitoring_mode = 'automatic_publish',
    requires_review = false,
    confidence = 0.96,
    etag = null,
    last_modified = null,
    content_hash = null,
    normalized_hash = null,
    last_document_url = null,
    sync_status = 'idle',
    next_check_at = now()
where id in ('src-vut-fch', 'src-vut-fp');

update public.content_sources
set parser_key = 'linked-document-review',
    monitoring_mode = 'automatic_review',
    requires_review = true,
    confidence = 0.60,
    etag = null,
    last_modified = null,
    content_hash = null,
    normalized_hash = null,
    last_document_url = null,
    sync_status = 'idle',
    next_check_at = now()
where id in ('src-mendelu-af', 'src-mendelu-ldf', 'src-mendelu-zf');

update public.content_sources
set source_url = 'https://frrms.mendelu.cz/student/prakticke-informace/',
    parser_key = 'generic-academic-html',
    monitoring_mode = 'automatic_review',
    requires_review = true,
    confidence = 0.60,
    etag = null,
    last_modified = null,
    content_hash = null,
    normalized_hash = null,
    last_document_url = null,
    sync_status = 'idle',
    next_check_at = now()
where id = 'src-mendelu-frrms';
