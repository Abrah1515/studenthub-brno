-- Deterministická fronta kontrol akademických zdrojů.
-- Migrace nemaže ani nepublikuje žádný obsah. Technické blokace uzavírá jako
-- diagnostiku zdroje a u duplicit ponechá nejnovější skutečný návrh aktivní.

alter table public.source_review_queue drop constraint if exists source_review_queue_status_check;
alter table public.source_review_queue
  add column if not exists normalized_hash text check (normalized_hash is null or normalized_hash ~ '^[a-f0-9]{64}$'),
  add column if not exists policy_version text,
  add column if not exists resolution_code text,
  add column if not exists superseded_by uuid;
alter table public.source_review_queue
  add constraint source_review_queue_status_check
  check (status in ('pending','approved','rejected','superseded','technical_closed'));

update public.source_review_queue
set status = 'technical_closed',
    resolution_code = 'technical_source_state',
    reviewed_at = coalesce(reviewed_at, now()),
    review_note = concat_ws(E'\n', nullif(review_note, ''), 'Automaticky uzavřeno: technický stav patří k diagnostice zdroje, nikoli do fronty obsahových změn.'),
    updated_at = now()
where status = 'pending'
  and reason in ('challenge','robots_disallowed','robots_unavailable','login_page','unexpected_mime','invalid_document');

with ranked as (
  select id,
         first_value(id) over (partition by source_id order by created_at desc, id desc) as keeper_id,
         row_number() over (partition by source_id order by created_at desc, id desc) as position
  from public.source_review_queue
  where status = 'pending'
)
update public.source_review_queue queue
set status = 'superseded',
    resolution_code = 'duplicate_pending_cleanup',
    superseded_by = ranked.keeper_id,
    reviewed_at = coalesce(queue.reviewed_at, now()),
    review_note = concat_ws(E'\n', nullif(queue.review_note, ''), 'Nahrazeno novějším aktivním návrhem stejného zdroje při bezpečném úklidu fronty.'),
    updated_at = now()
from ranked
where queue.id = ranked.id and ranked.position > 1;

drop index if exists public.source_review_queue_one_pending_per_source_idx;
create unique index source_review_queue_one_pending_per_source_idx
  on public.source_review_queue(source_id)
  where status = 'pending';
create index if not exists source_review_queue_source_hash_idx
  on public.source_review_queue(source_id, normalized_hash, created_at desc);

alter table public.content_sources drop constraint if exists content_sources_sync_status_check;
alter table public.content_sources add constraint content_sources_sync_status_check
  check (sync_status in ('idle','running','success','not_modified','failed','stale','manual_review','not_found',
    'challenge','robots_disallowed','robots_unavailable','login_page','unexpected_mime','invalid_document'));

alter table public.source_change_audits
  add column if not exists policy_version text,
  add column if not exists decision text,
  add column if not exists decision_reason text,
  add column if not exists archived_count integer not null default 0 check (archived_count >= 0);
alter table public.source_change_audits drop constraint if exists source_change_audits_decision_check;
alter table public.source_change_audits add constraint source_change_audits_decision_check
  check (decision is null or decision in ('auto_publish','manual_review','not_modified','technical_blocked'));

create or replace function public.enqueue_source_review(
  p_source_id text,
  p_sync_run_id uuid,
  p_proposed_payload jsonb,
  p_reason text,
  p_source_text text,
  p_confidence numeric,
  p_source_document_title text,
  p_source_page integer,
  p_normalized_hash text,
  p_policy_version text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_new_id uuid;
  v_superseded_ids uuid[];
begin
  perform pg_advisory_xact_lock(hashtext(p_source_id)::bigint);
  select id into v_existing_id
  from public.source_review_queue
  where source_id = p_source_id and status = 'pending' and normalized_hash = p_normalized_hash
  order by created_at desc, id desc
  limit 1;
  if v_existing_id is not null then return v_existing_id; end if;

  with replaced as (
    update public.source_review_queue
    set status = 'superseded', resolution_code = 'replaced_by_newer_run', reviewed_at = now(),
        review_note = concat_ws(E'\n', nullif(review_note, ''), 'Nahrazeno novějším návrhem stejného zdroje.'), updated_at = now()
    where source_id = p_source_id and status = 'pending'
    returning id
  ) select array_agg(id) into v_superseded_ids from replaced;

  insert into public.source_review_queue
    (source_id,sync_run_id,proposed_payload,reason,status,source_text,confidence,source_document_title,source_page,normalized_hash,policy_version)
  values
    (p_source_id,p_sync_run_id,p_proposed_payload,p_reason,'pending',p_source_text,p_confidence,p_source_document_title,p_source_page,p_normalized_hash,p_policy_version)
  returning id into v_new_id;

  if v_superseded_ids is not null then
    update public.source_review_queue set superseded_by = v_new_id where id = any(v_superseded_ids);
  end if;
  return v_new_id;
end;
$$;

revoke all on function public.enqueue_source_review(text,uuid,jsonb,text,text,numeric,text,integer,text,text) from public, anon, authenticated;
grant execute on function public.enqueue_source_review(text,uuid,jsonb,text,text,numeric,text,integer,text,text) to service_role;

