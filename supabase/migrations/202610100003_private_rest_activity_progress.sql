-- One extensible private activity store; existing coloring saves remain untouched.
begin;
create table if not exists public.rest_activity_progress (
 user_id uuid not null references public.profiles(id) on delete cascade,
 activity_id text not null check(activity_id='dots'),
 game_id text not null check(game_id in ('botanical','desk','library','brno','praha','olomouc')),
 manifest_version integer not null check(manifest_version=1),
 progress jsonb not null check(octet_length(progress::text)<=4096),
 percentage integer not null check(percentage between 0 and 100),
 completed boolean not null default false,
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(user_id,activity_id,game_id)
);
create index if not exists rest_activity_progress_recent on public.rest_activity_progress(user_id,activity_id,updated_at desc);
alter table public.rest_activity_progress enable row level security;
drop policy if exists rest_activity_progress_owner_read on public.rest_activity_progress;
create policy rest_activity_progress_owner_read on public.rest_activity_progress for select to authenticated using(user_id=auth.uid() and public.is_active_profile());
revoke all on public.rest_activity_progress from anon,authenticated;
grant select on public.rest_activity_progress to authenticated;
grant all on public.rest_activity_progress to service_role;
create or replace function public.save_rest_activity_progress(p_game_id text,p_revision bigint,p_progress jsonb)
returns public.rest_activity_progress language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved public.rest_activity_progress; point_count integer; cursor_value integer; item jsonb;
begin
 if actor is null or not public.is_active_profile() then raise exception 'activity_auth_required' using errcode='42501'; end if;
 point_count:=case p_game_id when 'botanical' then 10 when 'desk' then 6 when 'library' then 7 when 'brno' then 12 when 'praha' then 8 when 'olomouc' then 9 end;
 if point_count is null or p_revision is null or p_revision<0 or p_progress is null or octet_length(p_progress::text)>4096 then raise exception 'activity_invalid_payload'; end if;
 if jsonb_typeof(p_progress) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_progress))<>4 or p_progress->>'manifestVersion' is distinct from '1' or jsonb_typeof(p_progress->'cursor') is distinct from 'number' or jsonb_typeof(p_progress->'undo') is distinct from 'array' or jsonb_typeof(p_progress->'redo') is distinct from 'array' then raise exception 'activity_invalid_payload'; end if;
 if (p_progress->>'cursor') !~ '^[0-9]{1,3}$' or jsonb_array_length(p_progress->'undo')>30 or jsonb_array_length(p_progress->'redo')>30 then raise exception 'activity_invalid_payload'; end if;
 cursor_value:=(p_progress->>'cursor')::integer;
 if cursor_value>point_count then raise exception 'activity_invalid_payload'; end if;
 for item in select value from jsonb_array_elements((p_progress->'undo')||(p_progress->'redo')) loop
  if jsonb_typeof(item)<>'number' or (item#>>'{}') !~ '^[0-9]{1,3}$' or (item#>>'{}')::integer>point_count then raise exception 'activity_invalid_payload'; end if;
 end loop;
 if not public.consume_marketplace_rate_limit(substr(md5(actor::text),1,24),'rest-activity-write',60,60) then raise exception 'activity_rate_limit' using errcode='54000'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':dots:'||p_game_id,0));
 select * into saved from public.rest_activity_progress where user_id=actor and activity_id='dots' and game_id=p_game_id for update;
 if (saved.user_id is null and p_revision<>0) or (saved.user_id is not null and saved.revision<>p_revision) then raise exception 'activity_revision_conflict' using errcode='P0001'; end if;
 insert into public.rest_activity_progress(user_id,activity_id,game_id,manifest_version,progress,percentage,completed)
 values(actor,'dots',p_game_id,1,p_progress,round(cursor_value::numeric/point_count*100),cursor_value=point_count)
 on conflict(user_id,activity_id,game_id) do update set progress=excluded.progress,percentage=excluded.percentage,completed=excluded.completed,revision=rest_activity_progress.revision+1,updated_at=now() returning * into saved;
 return saved;
end $$;
revoke all on function public.save_rest_activity_progress(text,bigint,jsonb) from public,anon;
grant execute on function public.save_rest_activity_progress(text,bigint,jsonb) to authenticated;
commit;
