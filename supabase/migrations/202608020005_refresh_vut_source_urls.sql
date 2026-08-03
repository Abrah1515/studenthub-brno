-- Oprava přesměrovaných veřejných zdrojů FAST a FA VUT (ověřeno 2026-08-02).
-- Datová migrace je idempotentní a nemění žádné publikované akademické události.

update public.content_sources
set source_url = 'https://www.fce.vut.cz/pro-studenty/casovy-plan-studia',
    official_domain = 'fce.vut.cz',
    parser_key = 'linked-document-review',
    refresh_interval = interval '1 day',
    sync_status = 'manual_review',
    terms_note = 'Oficiální časový plán FAST vyžaduje kontrolu konkrétního studijního programu.',
    updated_at = now()
where id = 'src-vut-fast';

update public.content_sources
set source_url = 'https://www.fa.vut.cz/pages/casovy_plan.aspx',
    official_domain = 'fa.vut.cz',
    parser_key = 'linked-document-review',
    refresh_interval = interval '1 day',
    sync_status = 'manual_review',
    terms_note = 'Oficiální časový plán FA vyžaduje redakční kontrolu oborových termínů.',
    updated_at = now()
where id = 'src-vut-fa';
