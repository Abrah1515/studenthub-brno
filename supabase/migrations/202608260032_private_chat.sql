-- Private two-person chat connected to the existing unified profiles.
-- All writes use authenticated transactional RPCs or guarded server routes.

alter table public.profiles
  add column if not exists allow_chat_requests boolean not null default true;

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  initiator_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  context_type text not null check (context_type in ('profile','buddy_post','marketplace_listing')),
  context_id uuid not null,
  status text not null default 'requested' check (status in ('requested','active','declined','restricted','left')),
  status_before_restriction text check (status_before_restriction in ('requested','active')),
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  decline_until timestamptz,
  restricted_at timestamptz,
  restricted_reason text check (restricted_reason is null or char_length(restricted_reason) <= 800),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (initiator_id <> recipient_id)
);

create unique index chat_conversations_open_context_idx
  on public.chat_conversations(least(initiator_id,recipient_id),greatest(initiator_id,recipient_id),context_type,context_id)
  where status in ('requested','active','restricted');
create index chat_conversations_initiator_idx on public.chat_conversations(initiator_id,last_message_at desc);
create index chat_conversations_recipient_idx on public.chat_conversations(recipient_id,last_message_at desc);
create index chat_conversations_status_idx on public.chat_conversations(status,last_message_at desc);

create table public.chat_conversation_members (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  archived_at timestamptz,
  muted_until timestamptz,
  left_at timestamptz,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id,profile_id)
);
create index chat_members_profile_inbox_idx on public.chat_conversation_members(profile_id,archived_at,updated_at desc);
create index chat_members_unread_idx on public.chat_conversation_members(profile_id,last_read_at,conversation_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  client_nonce uuid not null default gen_random_uuid(),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  status text not null default 'active' check (status in ('active','hidden','deleted')),
  hidden_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (sender_id,client_nonce)
);
create index chat_messages_page_idx on public.chat_messages(conversation_id,created_at desc,id desc);
create index chat_messages_unread_idx on public.chat_messages(conversation_id,created_at,sender_id) where status = 'active';

create table public.chat_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('harassment','spam','fraud','unsafe_meeting','prohibited_sale','other')),
  detail text not null default '' check (char_length(detail) <= 800),
  status text not null default 'new' check (status in ('new','reviewed','actioned','dismissed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (message_id,reporter_id)
);
create index chat_reports_queue_idx on public.chat_message_reports(status,created_at desc);

create table public.chat_moderation_actions (
  id bigserial primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  report_id uuid references public.chat_message_reports(id) on delete set null,
  conversation_id uuid references public.chat_conversations(id) on delete set null,
  message_id uuid references public.chat_messages(id) on delete set null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('dismiss_report','hide_message','restrict_chat','suspend_profile','restore_message','restore_chat')),
  reason text not null default '' check (char_length(reason) <= 1000),
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now()
);
create index chat_moderation_audit_idx on public.chat_moderation_actions(created_at desc);
create index chat_moderation_report_idx on public.chat_moderation_actions(report_id,created_at desc);

create table public.chat_rate_limits (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('new_request','message','report')),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (profile_id,action)
);

create or replace function public.chat_is_member(target_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.chat_conversation_members m where m.conversation_id=target_conversation and m.profile_id=auth.uid());
$$;

create or replace function public.chat_reported_message(target_message uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() and exists(select 1 from public.chat_message_reports r where r.message_id=target_message);
$$;

create or replace function public.chat_profiles_blocked(first_profile uuid,second_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profile_blocks b where (b.blocker_id=first_profile and b.blocked_id=second_profile) or (b.blocker_id=second_profile and b.blocked_id=first_profile));
$$;

create or replace function public.consume_chat_rate_limit(target_action text,target_limit integer,target_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); current_row public.chat_rate_limits%rowtype;
begin
  if actor is null or target_action not in ('new_request','message','report') or target_limit < 1 or target_window_seconds < 1 then return false; end if;
  select * into current_row from public.chat_rate_limits where profile_id=actor and action=target_action for update;
  if not found then insert into public.chat_rate_limits(profile_id,action,request_count) values(actor,target_action,1); return true; end if;
  if current_row.window_started_at <= now()-make_interval(secs=>target_window_seconds) then
    update public.chat_rate_limits set window_started_at=now(),request_count=1 where profile_id=actor and action=target_action; return true;
  end if;
  if current_row.request_count >= target_limit then return false; end if;
  update public.chat_rate_limits set request_count=request_count+1 where profile_id=actor and action=target_action; return true;
end $$;

create or replace function public.enforce_chat_message_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare conversation public.chat_conversations%rowtype; member_left timestamptz; sender_messages integer;
begin
  new.body:=btrim(new.body); new.created_at:=clock_timestamp();
  select * into conversation from public.chat_conversations where id=new.conversation_id for update;
  if not found or new.sender_id not in (conversation.initiator_id,conversation.recipient_id) then raise exception 'chat_membership_required'; end if;
  if auth.uid() is not null and auth.uid()<>new.sender_id then raise exception 'chat_sender_mismatch'; end if;
  if public.chat_profiles_blocked(conversation.initiator_id,conversation.recipient_id) then raise exception 'chat_blocked'; end if;
  if not exists(select 1 from public.profiles p where p.id=new.sender_id and p.account_status='active' and p.username is not null and p.community_rules_accepted_at is not null) then raise exception 'chat_profile_incomplete'; end if;
  if exists(select 1 from public.profiles p where p.id in (conversation.initiator_id,conversation.recipient_id) and p.account_status<>'active') then raise exception 'chat_recipient_unavailable'; end if;
  select left_at into member_left from public.chat_conversation_members where conversation_id=conversation.id and profile_id=new.sender_id;
  if member_left is not null or conversation.status in ('declined','restricted','left') then raise exception 'chat_not_writable'; end if;
  if conversation.status='requested' and new.sender_id=conversation.initiator_id then
    select count(*) into sender_messages from public.chat_messages where conversation_id=conversation.id and sender_id=new.sender_id;
    if sender_messages>=1 then raise exception 'chat_request_one_message_only'; end if;
  elsif conversation.status='requested' and new.sender_id=conversation.recipient_id then
    update public.chat_conversations set status='active',accepted_at=coalesce(accepted_at,clock_timestamp()),updated_at=clock_timestamp() where id=conversation.id;
  elsif conversation.status<>'active' then raise exception 'chat_not_active'; end if;
  update public.chat_conversations set last_message_at=new.created_at,updated_at=new.created_at where id=conversation.id;
  update public.chat_conversation_members set archived_at=null,updated_at=new.created_at where conversation_id=conversation.id;
  return new;
end $$;
create trigger chat_messages_guard before insert on public.chat_messages for each row execute function public.enforce_chat_message_insert();

create or replace function public.start_chat_request(target_profile uuid,target_context_type text,target_context_id uuid,first_body text,message_nonce uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); conversation_id uuid; context_owner uuid; existing_status text; cooldown timestamptz;
begin
  if actor is null or actor=target_profile then raise exception 'chat_invalid_participants'; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(actor::text,target_profile::text)||greatest(actor::text,target_profile::text)||target_context_type||target_context_id::text,0));
  if not public.consume_chat_rate_limit('new_request',20,86400) then raise exception 'chat_request_rate_limit'; end if;
  if not exists(select 1 from public.profiles p where p.id=actor and p.account_status='active' and p.username is not null and p.community_rules_accepted_at is not null) then raise exception 'chat_profile_incomplete'; end if;
  if not exists(select 1 from public.profiles p where p.id=target_profile and p.account_status='active' and p.username is not null and p.community_rules_accepted_at is not null and p.allow_chat_requests) then raise exception 'chat_recipient_unavailable'; end if;
  if public.chat_profiles_blocked(actor,target_profile) then raise exception 'chat_blocked'; end if;
  if target_context_type='profile' then
    select id into context_owner from public.profiles where id=target_context_id and id=target_profile and profile_visibility='public' and account_status='active';
  elsif target_context_type='buddy_post' then
    select owner_id into context_owner from public.buddy_posts where id=target_context_id and owner_id=target_profile and status='active' and moderation_status='approved' and expires_at>=now();
  elsif target_context_type='marketplace_listing' then
    select seller_id into context_owner from public.marketplace_listings where id=target_context_id and seller_id=target_profile and status in ('active','reserved') and expires_at>=now();
  else raise exception 'chat_invalid_context'; end if;
  if context_owner is null then raise exception 'chat_context_unavailable'; end if;
  select id,status into conversation_id,existing_status from public.chat_conversations where least(initiator_id,recipient_id)=least(actor,target_profile) and greatest(initiator_id,recipient_id)=greatest(actor,target_profile) and context_type=target_context_type and context_id=target_context_id and status in ('requested','active','restricted') order by created_at desc limit 1;
  if conversation_id is not null then return conversation_id; end if;
  select max(decline_until) into cooldown from public.chat_conversations where least(initiator_id,recipient_id)=least(actor,target_profile) and greatest(initiator_id,recipient_id)=greatest(actor,target_profile) and context_type=target_context_type and context_id=target_context_id and status='declined';
  if cooldown is not null and cooldown>now() then raise exception 'chat_declined_cooldown'; end if;
  insert into public.chat_conversations(initiator_id,recipient_id,context_type,context_id) values(actor,target_profile,target_context_type,target_context_id) returning id into conversation_id;
  insert into public.chat_conversation_members(conversation_id,profile_id) values(conversation_id,actor),(conversation_id,target_profile);
  insert into public.chat_messages(conversation_id,sender_id,client_nonce,body) values(conversation_id,actor,message_nonce,first_body);
  return conversation_id;
end $$;

create or replace function public.send_chat_message(target_conversation uuid,message_body text,message_nonce uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); message_id uuid;
begin
  if actor is null or not public.chat_is_member(target_conversation) then raise exception 'chat_membership_required'; end if;
  if not public.consume_chat_rate_limit('message',90,60) then raise exception 'chat_message_rate_limit'; end if;
  insert into public.chat_messages(conversation_id,sender_id,client_nonce,body) values(target_conversation,actor,message_nonce,message_body) returning id into message_id;
  return message_id;
end $$;

create or replace function public.sync_chat_block_state()
returns trigger language plpgsql security definer set search_path = '' as $$
declare first_profile uuid:=coalesce(new.blocker_id,old.blocker_id); second_profile uuid:=coalesce(new.blocked_id,old.blocked_id);
begin
  if tg_op='INSERT' then
    update public.chat_conversations set status_before_restriction=case when status in ('requested','active') then status else status_before_restriction end,status='restricted',restricted_at=now(),restricted_reason='Vzájemné blokování profilu',updated_at=now() where (initiator_id=first_profile and recipient_id=second_profile) or (initiator_id=second_profile and recipient_id=first_profile);
  elsif not public.chat_profiles_blocked(first_profile,second_profile) then
    update public.chat_conversations set status=coalesce(status_before_restriction,'active'),status_before_restriction=null,restricted_at=null,restricted_reason=null,updated_at=now() where status='restricted' and restricted_reason='Vzájemné blokování profilu' and ((initiator_id=first_profile and recipient_id=second_profile) or (initiator_id=second_profile and recipient_id=first_profile));
  end if;
  if tg_op='INSERT' then return new; end if;
  return old;
end $$;
create trigger profile_blocks_chat_sync after insert or delete on public.profile_blocks for each row execute function public.sync_chat_block_state();

alter table public.chat_conversations enable row level security;
alter table public.chat_conversation_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_reports enable row level security;
alter table public.chat_moderation_actions enable row level security;
alter table public.chat_rate_limits enable row level security;

create policy "members read chat conversations" on public.chat_conversations for select to authenticated using (public.chat_is_member(id));
create policy "members read chat memberships" on public.chat_conversation_members for select to authenticated using (public.chat_is_member(conversation_id));
create policy "members or report moderators read chat messages" on public.chat_messages for select to authenticated using (public.chat_is_member(conversation_id) or public.chat_reported_message(id));
create policy "reporters and moderators read chat reports" on public.chat_message_reports for select to authenticated using (reporter_id=auth.uid() or public.is_admin());
create policy "moderators read chat action audit" on public.chat_moderation_actions for select to authenticated using (public.is_admin());

revoke all on public.chat_conversations,public.chat_conversation_members,public.chat_messages,public.chat_message_reports,public.chat_moderation_actions,public.chat_rate_limits from anon,authenticated;
grant select on public.chat_conversations,public.chat_conversation_members,public.chat_messages to authenticated;
grant select on public.chat_message_reports,public.chat_moderation_actions to authenticated;
grant all on public.chat_conversations,public.chat_conversation_members,public.chat_messages,public.chat_message_reports,public.chat_moderation_actions,public.chat_rate_limits to service_role;
grant usage,select on sequence public.chat_moderation_actions_id_seq to service_role;
revoke all on function public.start_chat_request(uuid,text,uuid,text,uuid),public.send_chat_message(uuid,text,uuid),public.consume_chat_rate_limit(text,integer,integer) from public,anon;
grant execute on function public.start_chat_request(uuid,text,uuid,text,uuid),public.send_chat_message(uuid,text,uuid),public.consume_chat_rate_limit(text,integer,integer) to authenticated,service_role;

alter table public.internal_notifications drop constraint if exists internal_notifications_target_type_check;
alter table public.internal_notifications add constraint internal_notifications_target_type_check check (target_type in ('academic_event','community_event','system','chat_conversation'));
alter table public.internal_notifications drop constraint if exists internal_notifications_kind_check;
alter table public.internal_notifications add constraint internal_notifications_kind_check check (kind in ('reminder','academic_change','new_important_term','system','chat_message','chat_request'));

do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object or undefined_object then null; end $$;

comment on table public.chat_messages is 'Soukromé textové zprávy čitelné pouze členům konverzace; administrace získá přístup jen k nahlášené zprávě.';
comment on column public.profiles.allow_chat_requests is 'Uživatel může odmítnout vznik nových chatových žádostí; existující aktivní chaty zůstávají dostupné.';
