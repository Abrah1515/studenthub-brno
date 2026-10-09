-- Shared across cities; only the account owner can read a drawing.
begin;
create table if not exists public.coloring_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  coloring_id text not null check (coloring_id in ('botanical','desk','library','cafe','brno','praha','olomouc','ostrava')),
  asset_version integer not null default 1 check (asset_version=1),
  drawing jsonb not null check (octet_length(drawing::text)<=600000),
  percentage integer not null default 0 check (percentage between 0 and 100),
  completed boolean not null default false,
  revision bigint not null default 1 check (revision>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,coloring_id)
);
create index if not exists coloring_progress_recent on public.coloring_progress(user_id,updated_at desc);
alter table public.coloring_progress enable row level security;
drop policy if exists coloring_progress_owner_read on public.coloring_progress;
create policy coloring_progress_owner_read on public.coloring_progress for select to authenticated
using (user_id=auth.uid() and public.is_active_profile());
revoke all on public.coloring_progress from anon,authenticated;
grant select on public.coloring_progress to authenticated;
grant all on public.coloring_progress to service_role;

create or replace function public.save_coloring_progress(p_coloring_id text,p_revision bigint,p_drawing jsonb,p_percentage integer)
returns public.coloring_progress language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); current_row public.coloring_progress; s jsonb; point jsonb; item record; point_count integer:=0;
begin
  if actor is null or not exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=actor and p.account_status='active' and not p.is_blocked and u.email_confirmed_at is not null) then raise exception 'coloring_auth_required' using errcode='42501'; end if;
  if p_coloring_id is null or p_revision is null or p_percentage is null or p_coloring_id not in ('botanical','desk','library','cafe','brno','praha','olomouc','ostrava') or p_revision<0 or p_drawing is null or octet_length(p_drawing::text)>600000 or p_percentage not between 0 and 100 then raise exception 'coloring_invalid_payload'; end if;
  if jsonb_typeof(p_drawing) is distinct from 'object' or p_drawing->>'assetVersion' is distinct from '1' or jsonb_typeof(p_drawing->'colors') is distinct from 'object' or jsonb_typeof(p_drawing->'strokes') is distinct from 'array' or jsonb_typeof(p_drawing->'completed') is distinct from 'boolean' then raise exception 'coloring_invalid_payload'; end if;
  if (select count(*) from jsonb_object_keys(p_drawing->'colors'))>1500 or jsonb_array_length(p_drawing->'strokes')>300 then raise exception 'coloring_invalid_payload'; end if;
  for item in select * from jsonb_each_text(p_drawing->'colors') loop
    if item.value is null or item.key !~ '^[0-9]{1,5}$' or item.value !~ '^#[0-9a-fA-F]{6}$' then raise exception 'coloring_invalid_payload'; end if;
  end loop;
  for s in select value from jsonb_array_elements(p_drawing->'strokes') loop
    if jsonb_typeof(s->'points') is distinct from 'array' or jsonb_typeof(s->'erase') is distinct from 'boolean' or jsonb_typeof(s->'width') is distinct from 'number' or jsonb_typeof(s->'color') is distinct from 'string' then raise exception 'coloring_invalid_payload'; end if;
    if (s->>'color') !~ '^#[0-9a-fA-F]{6}$' or (s->>'width')::numeric not between 1 and 70 or jsonb_array_length(s->'points') not between 1 and 4000 then raise exception 'coloring_invalid_payload'; end if;
    point_count:=point_count+jsonb_array_length(s->'points');
    for point in select value from jsonb_array_elements(s->'points') loop
      if jsonb_typeof(point)<>'array' or jsonb_array_length(point)<>3 then raise exception 'coloring_invalid_payload'; end if;
      if exists(select 1 from jsonb_array_elements(point) v where jsonb_typeof(v)<>'number' or (v#>>'{}')::numeric not between 0 and 1) then raise exception 'coloring_invalid_payload'; end if;
    end loop;
  end loop;
  if point_count>16000 then raise exception 'coloring_invalid_payload'; end if;
  if not public.consume_marketplace_rate_limit(substr(md5(actor::text),1,24),'coloring-write',60,60) then raise exception 'coloring_rate_limit' using errcode='54000'; end if;
  -- Serialize first saves and subsequent writes for this account/drawing pair.
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_coloring_id,0));
  select * into current_row from public.coloring_progress where user_id=actor and coloring_id=p_coloring_id for update;
  if (current_row.user_id is null and p_revision<>0) or (current_row.user_id is not null and current_row.revision<>p_revision) then raise exception 'coloring_revision_conflict' using errcode='40001'; end if;
  insert into public.coloring_progress(user_id,coloring_id,drawing,percentage,completed)
  values(actor,p_coloring_id,p_drawing,p_percentage,(p_drawing->>'completed')::boolean)
  on conflict(user_id,coloring_id) do update set drawing=excluded.drawing,percentage=excluded.percentage,completed=excluded.completed,revision=coloring_progress.revision+1,updated_at=now()
  returning * into current_row;
  return current_row;
end $$;
revoke all on function public.save_coloring_progress(text,bigint,jsonb,integer) from public,anon;
grant execute on function public.save_coloring_progress(text,bigint,jsonb,integer) to authenticated;
commit;
