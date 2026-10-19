set search_path = '';
with custom_triggers as (
  select pg_catalog.pg_get_triggerdef(t.oid, true) || ';' as ddl
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid=t.tgrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  join pg_catalog.pg_proc f on f.oid=t.tgfoid
  join pg_catalog.pg_namespace fn on fn.oid=f.pronamespace
  where n.nspname in ('auth','storage') and not t.tgisinternal and fn.nspname='public'
), custom_policies as (
  select 'create policy ' || pg_catalog.quote_ident(policyname) || ' on ' || pg_catalog.quote_ident(schemaname) || '.' || pg_catalog.quote_ident(tablename)
    || ' as ' || permissive || ' for ' || cmd || ' to '
    || (select pg_catalog.string_agg(case when r='public' then 'public' else pg_catalog.quote_ident(r) end, ', ' order by r) from pg_catalog.unnest(roles) r)
    || case when qual is not null then ' using (' || qual || ')' else '' end
    || case when with_check is not null then ' with check (' || with_check || ')' else '' end || ';' as ddl
  from pg_catalog.pg_policies where schemaname in ('auth','storage')
)
select pg_catalog.json_build_object(
  'sql', coalesce((select pg_catalog.string_agg(ddl,E'\n' order by ddl) from custom_triggers),'') || E'\n' || coalesce((select pg_catalog.string_agg(ddl,E'\n' order by ddl) from custom_policies),''),
  'triggerCount', (select count(*) from custom_triggers),
  'policyCount', (select count(*) from custom_policies)
);
