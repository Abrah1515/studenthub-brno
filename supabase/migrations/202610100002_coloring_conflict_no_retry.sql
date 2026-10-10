-- An optimistic revision conflict is permanent, not a serialization failure.
-- PostgREST 14 retries SQLSTATE 40001 indefinitely. Preserve the function,
-- ownership, grants and stored data; change only this application exception.
begin;
do $$
declare definition text;
begin
  select pg_get_functiondef('public.save_coloring_progress(text,bigint,jsonb,integer)'::regprocedure) into definition;
  definition := replace(definition, 'errcode=''40001''', 'errcode=''P0001''');
  execute definition;
end $$;
notify pgrst, 'reload schema';
commit;
