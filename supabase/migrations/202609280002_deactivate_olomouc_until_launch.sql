-- Produkční pojistka první fáze: již dříve založená Olomouc nesmí zůstat
-- publikovaná jen proto, že předcházela zavedení přepínačů modulů.

with prior as materialized (
  select
    id,
    jsonb_build_object(
      'enabled', enabled,
      'publicStatus', public_status,
      'modules', module_config
    ) as previous_config
  from public.cities
  where id = 'olomouc'
    and (
      enabled
      or public_status <> 'draft'
      or exists (
        select 1
        from jsonb_each_text(module_config) as module
        where module.value = 'true'
      )
    )
), deactivated as (
  update public.cities as city
  set
    enabled = false,
    public_status = 'draft',
    module_config = '{
      "calendar": false, "places": false, "community": false, "buddy": false,
      "marketplace": false, "housing": false, "jobs": false, "chat": false,
      "watcher": false, "settings": false, "offers": false
    }'::jsonb,
    updated_at = now()
  from prior
  where city.id = prior.id
  returning city.id, prior.previous_config, city.module_config
)
insert into public.city_configuration_audit (
  city_id, actor_id, action, previous_config, new_config
)
select
  id,
  null,
  'unpublished',
  previous_config,
  jsonb_build_object(
    'enabled', false,
    'publicStatus', 'draft',
    'modules', module_config,
    'reason', 'first-phase-launch-safety'
  )
from deactivated;

comment on column public.cities.module_config is
  'Serverově vynucené přepínače městských modulů; Olomouc zůstává do samostatného schválení celá vypnutá.';
