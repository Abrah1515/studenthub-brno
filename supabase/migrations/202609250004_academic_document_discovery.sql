-- Úsporné hloubkové hledání akademických dokumentů. Běžná kontrola známého
-- dokumentu zůstává častá, nový průzkum rozcestníků proběhne nejvýše týdně.
alter table public.content_sources
  add column if not exists last_deep_discovery_at timestamptz,
  add column if not exists next_deep_discovery_at timestamptz,
  add column if not exists discovery_status text,
  add column if not exists discovery_candidate_count integer not null default 0,
  add column if not exists discovery_summary jsonb not null default '{}'::jsonb;

alter table public.content_sources drop constraint if exists content_sources_discovery_status_check;
alter table public.content_sources add constraint content_sources_discovery_status_check check (
  discovery_status is null or discovery_status in (
    'public_source_found',
    'general_calendar_only',
    'login_required',
    'blocked',
    'public_source_not_found',
    'admissions_only',
    'stale_academic_year',
    'needs_review'
  )
);

alter table public.content_sources drop constraint if exists content_sources_discovery_candidate_count_check;
alter table public.content_sources add constraint content_sources_discovery_candidate_count_check
  check (discovery_candidate_count >= 0);

create index if not exists content_sources_deep_discovery_due_idx
  on public.content_sources(next_deep_discovery_at, university_id, faculty_id)
  where enabled = true and source_type = 'academic_calendar';

update public.content_sources
set next_deep_discovery_at = coalesce(next_deep_discovery_at, now()),
    discovery_status = coalesce(discovery_status, 'needs_review')
where enabled = true and source_type = 'academic_calendar';

-- FEKT zůstává registrován přes obecný oficiální rozcestník. Konkrétní PDF se
-- nesmí hardcodovat; nový discovery proces ho najde podle názvu a skutečného MIME.
update public.content_sources
set source_url = 'https://www.vut.cz/uredni-deska/vnitrni-legislativa-fekt/rozhodnuti-s8',
    official_domain = 'vut.cz',
    format = 'html',
    parser_key = 'linked-document-auto',
    monitoring_mode = 'automatic_publish',
    enabled = true,
    next_deep_discovery_at = now(),
    etag = null,
    last_modified = null,
    content_hash = null,
    normalized_hash = null,
    sync_status = 'idle',
    next_check_at = now(),
    terms_note = 'Oficiální úřední deska FEKT; systém vyhledává harmonogramy i konkrétní plány zkoušek a typ dokumentu ověřuje podle HTTP a signatury souboru.'
where id = 'src-vut-fekt';

insert into public.content_sources (
  id, university_id, faculty_id, source_type, source_url, official_domain,
  format, parser_key, enabled, refresh_interval, sync_status, confidence,
  requires_review, notes, terms_note, monitoring_mode, next_check_at,
  next_deep_discovery_at, discovery_status
) values (
  'src-vut-fekt-exams', 'vut', 'vut-fekt', 'academic_calendar',
  'https://www.vut.cz/uredni-deska/vnitrni-legislativa-fekt/vyhlasky-pro-studenty-s27',
  'vut.cz', 'html', 'linked-document-auto', true, interval '9 hours', 'idle',
  0.96, false,
  'Obecný oficiální rozcestník vyhlášek pro studenty; konkrétní dokument vybírá discovery vrstva.',
  'Vyhledávání aktuálních plánů předmětových zkoušek, zápočtů a kolokvií bez hardcodování PDF.',
  'automatic_publish', now(), now(), 'needs_review'
)
on conflict (id) do update set
  source_url = excluded.source_url,
  official_domain = excluded.official_domain,
  format = excluded.format,
  parser_key = excluded.parser_key,
  enabled = excluded.enabled,
  monitoring_mode = excluded.monitoring_mode,
  terms_note = excluded.terms_note,
  next_check_at = least(coalesce(public.content_sources.next_check_at, now()), now()),
  next_deep_discovery_at = least(coalesce(public.content_sources.next_deep_discovery_at, now()), now());

comment on column public.content_sources.discovery_status is
  'Výsledek posledního povoleného hloubkového hledání; nenalezeno neznamená, že termíny neexistují.';
comment on column public.content_sources.discovery_summary is
  'Neveřejné shrnutí nalezeného dokumentu a důvodu klasifikace bez osobních údajů.';
