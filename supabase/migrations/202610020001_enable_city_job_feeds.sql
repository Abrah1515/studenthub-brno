-- Povolení smluvních brigádních feedů pro Prahu a Olomouc.
-- Skutečné XML adresy zůstávají v serverových proměnných prostředí.

insert into public.city_configuration_audit (city_id, actor_id, action, previous_config, new_config)
select c.id, null, 'enabled',
  jsonb_build_object('jobs', coalesce((c.module_config->>'jobs')::boolean, false)),
  jsonb_build_object('jobs', true, 'verifiedAt', '2026-10-02')
from public.cities c
where c.id in ('praha', 'olomouc')
  and not exists (
    select 1 from public.city_configuration_audit a
    where a.city_id = c.id and a.action = 'enabled' and a.new_config->>'verifiedAt' = '2026-10-02'
  );

update public.cities
set module_config = jsonb_set(coalesce(module_config, '{}'::jsonb), '{jobs}', 'true'::jsonb),
    updated_at = now()
where id in ('praha', 'olomouc');

insert into public.content_sources (
  id, city_id, university_id, faculty_id, source_type, source_url, official_domain,
  format, parser_key, enabled, refresh_interval, monitoring_mode, terms_note, notes,
  confidence, requires_review, next_check_at
) values
(
  'src-fajn-brigady-praha', 'praha', null, null, 'job_feed',
  'https://www.fajn-brigady.cz/brigady/praha/', 'media.fajnsprava.cz',
  'xml', 'fajn-v2-xml', true, interval '9 hours', 'automatic_publish',
  'Smluvní XML feed Fajn brigády pro Prahu; skutečná adresa je pouze v serverovém prostředí.',
  'Import je izolovaný provider klíčem a city_id=praha.', 1, false, now()
),
(
  'src-fajn-brigady-olomouc', 'olomouc', null, null, 'job_feed',
  'https://www.fajn-brigady.cz/brigady/olomouc/', 'media.fajnsprava.cz',
  'xml', 'fajn-v2-xml', true, interval '9 hours', 'automatic_publish',
  'Smluvní XML feed Fajn brigády pro Olomouc; skutečná adresa je pouze v serverovém prostředí.',
  'Import je izolovaný provider klíčem a city_id=olomouc.', 1, false, now()
)
on conflict (id) do update set
  city_id = excluded.city_id,
  university_id = null,
  faculty_id = null,
  source_type = excluded.source_type,
  source_url = excluded.source_url,
  official_domain = excluded.official_domain,
  format = excluded.format,
  parser_key = excluded.parser_key,
  enabled = true,
  refresh_interval = excluded.refresh_interval,
  monitoring_mode = excluded.monitoring_mode,
  terms_note = excluded.terms_note,
  notes = excluded.notes,
  confidence = excluded.confidence,
  requires_review = excluded.requires_review,
  updated_at = now();
