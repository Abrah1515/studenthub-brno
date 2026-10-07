-- Starší monitor porovnával názvy míst příliš doslovně a dostupné adresáře
-- označoval jako nedostupné. Data ani ověření nemažeme; pouze je vracíme
-- do bezpečné fronty k opakované kontrole opraveným monitorem.
update public.places
set
  source_checked_at = null,
  source_miss_count = 0,
  source_sync_status = 'needs_review',
  updated_at = now()
where city_id = 'brno'
  and status = 'approved'
  and is_demo = false
  and source_url is not null
  and source_sync_status = 'unavailable';
