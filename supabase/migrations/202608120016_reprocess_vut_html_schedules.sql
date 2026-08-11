-- Re-run the corrected structured FIT/FSI parsers once without touching
-- already published events. Conditional request metadata must be cleared as
-- well, otherwise an HTTP 304 could skip the corrected parser.
update public.content_sources
set
  etag = null,
  last_modified = null,
  content_hash = null,
  normalized_hash = null,
  next_check_at = now(),
  next_retry_at = null,
  sync_status = 'idle',
  last_error_message = null
where id in ('src-vut-fit', 'src-vut-fsi');
