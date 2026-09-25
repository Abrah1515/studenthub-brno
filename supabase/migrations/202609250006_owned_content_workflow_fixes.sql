-- Vlastnictví ručních návrhů brigád a bezpečné návraty editovaného obsahu do moderace.
alter type public.content_status add value if not exists 'deleted';
