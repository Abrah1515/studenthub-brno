-- Odklidit pouze neschválené návrhy vytvořené původní placenou AI kontrolou.
-- Skutečné academic_events ani nová deterministická kontrola se nemění.
create table if not exists public.academic_calendar_legacy_ai_archive (
  record_type text not null check (record_type in ('run', 'finding', 'finding_audit')),
  original_id text not null,
  payload jsonb not null,
  archived_at timestamptz not null default now(),
  primary key (record_type, original_id)
);

alter table public.academic_calendar_legacy_ai_archive enable row level security;
revoke all on public.academic_calendar_legacy_ai_archive from anon, authenticated;
grant all on public.academic_calendar_legacy_ai_archive to service_role;

comment on table public.academic_calendar_legacy_ai_archive is
  'Neveřejná obnovitelná kopie neschválených nálezů původní AI kontroly kalendáře; není součástí pracovní fronty.';

insert into public.academic_calendar_legacy_ai_archive (record_type, original_id, payload)
select 'run', r.id::text, to_jsonb(r)
from public.academic_calendar_ai_runs r
where r.city_id = 'brno' and r.ai_provider = 'openai-responses'
  and not exists (select 1 from public.academic_calendar_ai_findings f where f.run_id = r.id and f.status <> 'cannot_verify')
  and not exists (
    select 1 from public.academic_calendar_ai_findings f
    join public.academic_calendar_ai_finding_audit a on a.finding_id = f.id
    where f.run_id = r.id
  )
on conflict (record_type, original_id) do nothing;

insert into public.academic_calendar_legacy_ai_archive (record_type, original_id, payload)
select 'finding', f.id::text, to_jsonb(f)
from public.academic_calendar_ai_findings f
join public.academic_calendar_legacy_ai_archive a on a.record_type = 'run' and a.original_id = f.run_id::text
join public.academic_calendar_ai_runs r on r.id = f.run_id and r.city_id = 'brno' and r.ai_provider = 'openai-responses'
on conflict (record_type, original_id) do nothing;

do $$
begin
  if exists (
    select 1 from public.academic_calendar_ai_runs r
    where r.city_id = 'brno' and r.ai_provider = 'openai-responses'
      and not exists (select 1 from public.academic_calendar_ai_findings f where f.run_id = r.id and f.status <> 'cannot_verify')
      and not exists (
        select 1 from public.academic_calendar_ai_findings f
        join public.academic_calendar_ai_finding_audit h on h.finding_id = f.id
        where f.run_id = r.id
      )
      and not exists (
        select 1 from public.academic_calendar_legacy_ai_archive a
        where a.record_type = 'run' and a.original_id = r.id::text
      )
  ) or exists (
    select 1 from public.academic_calendar_ai_findings f
    join public.academic_calendar_ai_runs r on r.id = f.run_id and r.city_id = 'brno' and r.ai_provider = 'openai-responses'
    join public.academic_calendar_legacy_ai_archive ar on ar.record_type = 'run' and ar.original_id = r.id::text
    where not exists (
      select 1 from public.academic_calendar_legacy_ai_archive a
      where a.record_type = 'finding' and a.original_id = f.id::text
    )
  ) then
    raise exception 'Archiv původní AI kontroly není úplný; žádné záznamy nebyly odstraněny.';
  end if;
end;
$$;

delete from public.academic_calendar_ai_runs r
where r.city_id = 'brno' and r.ai_provider = 'openai-responses'
  and exists (
    select 1 from public.academic_calendar_legacy_ai_archive a
    where a.record_type = 'run' and a.original_id = r.id::text
  )
  and not exists (select 1 from public.academic_calendar_ai_findings f where f.run_id = r.id and f.status <> 'cannot_verify')
  and not exists (
    select 1 from public.academic_calendar_ai_findings f
    join public.academic_calendar_ai_finding_audit a on a.finding_id = f.id
    where f.run_id = r.id
  );
