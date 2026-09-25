-- Jednorázový idempotentní backfill ověřeného veřejného plánu FEKT.
-- Dokument byl 25. 9. 2026 dostupný bez přihlášení jako application/pdf.
-- Další kontroly a změny zajišťuje obecný discovery/sync proces zdroje
-- src-vut-fekt-exams; tato migrace nehardcoduje zdroj do parseru.

with verified_events(external_id, title, study_year, local_date, duplicate_fingerprint) as (
  values
    ('128ff8ab2b6b3581ce1795de26df1fb7', 'BPC-EL1 – 1. termín zkoušky', 1, date '2027-01-08', 'c0c76bf6c96470f0bb139a5a9a563df74543a8eae60d4de509c17cbc59a4d5f4'),
    ('b91c5cd25c6abb340841bfb560260fcd', 'BPC-EL1 – 2. termín zkoušky', 1, date '2027-01-18', '64afe5ec77954475cce58d83233416a77c2151896726dfa56a55917e1fab5afe'),
    ('20fe317eeee74c1d50dd0613a41ed623', 'BPC-EL1 – 3. termín zkoušky', 1, date '2027-01-25', '592f19bf3a06dfcfc866c2d2e7bacc8d134e48090129601c36cd68189ecb0522'),
    ('22a7cb4ea6605f1ed0f7784852879d0b', 'BPC-VMP – 1. termín zkoušky', 1, date '2027-01-06', '199e5ca62e434be0287d593130369ad5195c8193d4b83d3814f317da53ea1d01'),
    ('961297c10f0cb56f74e8ddc3bab98908', 'BPC-VMP – 2. termín zkoušky', 1, date '2027-01-15', 'a549a00dd7411779a746df027c7eb1d652f02fc957f501e188f301cd3c528c99'),
    ('9b9ae2ff2ce38068ce54fc189128a899', 'BPC-VMP – 3. termín zkoušky', 1, date '2027-01-26', '9691f3a45a052b7c66baaa234c431610bc57706ae830fee96240411885ad7c65'),
    ('173ac675f8686546d692b07d44203f4e', 'BPC-FY1B, BPC-FY1, BPC-FYE – 1. termín zkoušky', 1, date '2027-01-04', 'c13938dccb723fb2a8dc02b65e0aa4e9dce633f2e72d66fff6dea261fcdafb87'),
    ('18d65cec51090239203c015c17509f08', 'BPC-FY1B, BPC-FY1, BPC-FYE – 2. termín zkoušky', 1, date '2027-01-13', '1ef68ed55607f707ca64cb492f4c6fbfd55ada9b1ae8280a6c22b7af362a31d8'),
    ('bf0583d8ae4c5295fa170bf7d18f454b', 'BPC-FY1B, BPC-FY1, BPC-FYE – 3. termín zkoušky', 1, date '2027-01-27', 'da5324bdc7e0bfd070451373322c933cd5b159447092ce21ef48c9ba49c4a51d'),
    ('7251befe7541a698f7e72de7fdf1dc39', 'BPC-MA1(B) – 1. termín zkoušky', 1, date '2026-12-15', 'f7426f5c4336eeca1e9c5b53ba9694a4854e2244fc1690254f1f97c5ce8ad9b3'),
    ('2a076b214fdf0a6a9c4b74984a83957f', 'BPC-MA1(B) – 2. termín zkoušky', 1, date '2027-01-12', 'a1a5df80b79ea6cbcdc14314363358855a064aaeb18c6270b7a2e422fa607ec0'),
    ('e36b91bbfe2e0dea27bdc271afed9c99', 'BPC-MA1(B) – 3. termín zkoušky', 1, date '2027-01-22', '8c91705fa134d2da07994020cc2a51d29b663681620fbeefc9a2481212e8e27e'),
    ('ebdcccac80b854fc202ec7359993d814', 'BPC-MPE – 1. termín zkoušky', 1, date '2027-01-11', '28e7db7ceca2578da27db0e1e6161c7777bf4eaa3d231522c86eeb61d725d01d'),
    ('0f6ab6cf2d940f22e3ffaf83abe03910', 'BPC-MPE – 2. termín zkoušky', 1, date '2027-01-21', '3bf903026fcc81faf6d58228c68dd9479b4feb544b84ab5067311f10118a48e7'),
    ('797817eed1771e2295cc6d380228ade2', 'BPC-MPE – 3. termín zkoušky', 1, date '2027-01-28', '3a75ce2c79769259e412bc5a6ddc01030c7987fea929e39a507719ac30070145'),
    ('db503fb8271d2183ee975d84ff8ca6ce', 'BPC-TDE, BPC-PC1X – nejzazší termín zápočtu', 1, date '2026-12-16', '2da910ad48aa25c3df1ba7a14c4472635be582e8b597ac93c3701feaae34abf2'),
    ('f70797fdb0033244304d99afc97dca96', 'BPC-MA3, BPC-MA3A, BPC-FY2 – 1. termín zkoušky', 2, date '2027-01-05', '42b020785bdb8f9243082c1bb8c064ac2a548ed6fa9eb976ea232d992d4c7fa5'),
    ('664d048f8d6638a2df8de90e43f4d254', 'BPC-MA3, BPC-MA3A, BPC-FY2 – 2. termín zkoušky', 2, date '2027-01-14', 'b3bc05be640bcfcec527894374c92766aa01b255901763c6c150f2d85b42b48d'),
    ('16feea2861a1a0209ad226f4ce31b95b', 'BPC-MA3, BPC-MA3A, BPC-FY2 – 3. termín zkoušky', 2, date '2027-01-25', '831cbfbb9b1152ddb9f1b3924fab8326968c72418b8587c8de751a5e3e52db9d'),
    ('5a91debbe8d79340fecfaf5ef34045b2', 'BPC-MVE, BPC-MVA, BPC-MVAA – 1. termín zkoušky', 2, date '2027-01-07', '9150324180d65d0b41d75142ffcdb11ace3dfaae74571be9374b60ee651ade07'),
    ('472c1007a387750ab75628a805a1c8e8', 'BPC-MVE, BPC-MVA, BPC-MVAA – 2. termín zkoušky', 2, date '2027-01-19', '810e6baa0dcdde79eed37a7dabe4cb6e642f0897b435754c7b911ff5451f91b6'),
    ('8d14ea5e55add1b48183f7659cc77508', 'BPC-MVE, BPC-MVA, BPC-MVAA – 3. termín zkoušky', 2, date '2027-01-29', '292ca505b4b87dead6968a71b51455bd5eaba04e492557bf92756edcf331698d'),
    ('0e5529cb23ca0d1cc3bd86fbf33c4256', 'BPC-SASB – 1. termín zkoušky', 2, date '2027-01-12', '970663b15048d6b9c5ed1a870a49c4ba073a49aced7cb471ddbc2bd4150e13a2'),
    ('2b3ddb1777730267cfa9693e8fc9394b', 'BPC-SASB – 2. termín zkoušky', 2, date '2027-01-22', 'acc30154c1f2a87540748419bd9e1ccbc5fd44e7c181eb004b84de727e238ae5'),
    ('b71104484adbbf1118f79cd96fd55f52', 'BPC-SASB – 3. termín zkoušky', 2, date '2027-02-01', 'a84ea6c977e0f440c03782113169f94076078ea2cdd2376933b1036457be007a')
), prepared as (
  select
    external_id,
    title,
    study_year,
    local_date::timestamp at time zone 'Europe/Prague' as starts_at,
    duplicate_fingerprint
  from verified_events
)
insert into public.academic_events (
  external_id, title, description, category, school, faculty, starts_at,
  all_day, timezone, academic_year, study_years, semester, scope_type,
  university_id, faculty_id, city_id, source_id, source_name, source_url,
  source_document_title, source_page, source_updated_at, source_modified_at,
  source_modified_basis, confidence, status, verification_status,
  last_verified_at, is_demo, is_cancelled, change_state, manual_override,
  duplicate_fingerprint
)
select
  external_id,
  title,
  'Veřejný fakultní plán. Rozhodující je termín uvedený studentovi v IS školy. Související předměty: ' || split_part(title, ' – ', 1) || '.',
  'exam', 'VUT', 'vut-fekt', starts_at,
  true, 'Europe/Prague', '2026/2027', array[study_year]::smallint[], 'autumn', 'faculty',
  'vut', 'vut-fekt', 'brno', 'src-vut-fekt-exams', 'Oficiální veřejný zdroj',
  'https://www.vut.cz/uredni-deska/vnitrni-legislativa-fekt/-d363098/casovy-plan-zkousek-zs-2026-27-p375964',
  'Časový plán zkoušek pro studenty bakalářských programů v zimním semestru ak. r. 2026/27',
  1, timestamptz '2026-09-01 00:00:00+02', timestamptz '2026-09-01 00:00:00+02',
  'explicit_school_update', 0.990, 'approved', 'verified', now(), false, false,
  'unchanged', false, duplicate_fingerprint
from prepared
on conflict (source_id, external_id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  starts_at = excluded.starts_at,
  all_day = excluded.all_day,
  academic_year = excluded.academic_year,
  study_years = excluded.study_years,
  semester = excluded.semester,
  source_url = excluded.source_url,
  source_document_title = excluded.source_document_title,
  source_updated_at = excluded.source_updated_at,
  source_modified_at = excluded.source_modified_at,
  source_modified_basis = excluded.source_modified_basis,
  confidence = excluded.confidence,
  status = excluded.status,
  verification_status = excluded.verification_status,
  last_verified_at = excluded.last_verified_at,
  is_demo = false,
  is_cancelled = false,
  archived_at = null,
  change_state = 'unchanged',
  duplicate_fingerprint = excluded.duplicate_fingerprint,
  updated_at = now()
where public.academic_events.manual_override = false;

update public.content_sources
set last_document_url = 'https://www.vut.cz/uredni-deska/vnitrni-legislativa-fekt/-d363098/casovy-plan-zkousek-zs-2026-27-p375964',
    last_final_url = 'https://www.vut.cz/uredni-deska/vnitrni-legislativa-fekt/-d363098/casovy-plan-zkousek-zs-2026-27-p375964',
    last_content_type = 'application/pdf',
    academic_year = '2026/2027',
    discovery_status = 'public_source_found',
    discovery_candidate_count = greatest(discovery_candidate_count, 1),
    discovery_summary = jsonb_build_object(
      'kind', 'subject_exams',
      'documentUrl', 'https://www.vut.cz/uredni-deska/vnitrni-legislativa-fekt/-d363098/casovy-plan-zkousek-zs-2026-27-p375964',
      'academicYear', '2026/2027',
      'verifiedEventCount', 25
    ),
    last_checked_at = now(),
    last_success_at = now(),
    last_http_status = 200,
    sync_status = 'success',
    requires_review = false,
    consecutive_failures = 0,
    next_check_at = now() + interval '9 hours',
    next_deep_discovery_at = now() + interval '7 days',
    updated_at = now()
where id = 'src-vut-fekt-exams';
