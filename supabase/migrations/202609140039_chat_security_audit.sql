-- Forward-only hardening. No user data is changed or removed.
-- Internal block lookup must not expose relationships through public RPC.
revoke all on function public.chat_profiles_blocked(uuid,uuid) from public,anon,authenticated;
grant execute on function public.chat_profiles_blocked(uuid,uuid) to service_role;

create or replace function public.consume_chat_rate_limit(target_action text,target_limit integer,target_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); quota integer; window_seconds integer; accepted boolean;
begin
  if actor is null or not public.is_profile_ready(actor) then return false; end if;
  case target_action
    when 'new_request' then quota:=20; window_seconds:=86400;
    when 'message' then quota:=90; window_seconds:=60;
    when 'report' then quota:=10; window_seconds:=86400;
    else return false;
  end case;
  -- Preserve the RPC signature, but never let a caller alter the policy.
  if target_limit is distinct from quota or target_window_seconds is distinct from window_seconds then return false; end if;
  insert into public.chat_rate_limits as limits(profile_id,action,request_count)
    values(actor,target_action,1)
    on conflict (profile_id,action) do update
      set request_count=case when limits.window_started_at<=now()-make_interval(secs=>window_seconds) then 1 else limits.request_count+1 end,
          window_started_at=case when limits.window_started_at<=now()-make_interval(secs=>window_seconds) then now() else limits.window_started_at end
      where limits.window_started_at<=now()-make_interval(secs=>window_seconds) or limits.request_count<quota
    returning true into accepted;
  return coalesce(accepted,false);
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
  if not public.is_profile_ready(new.sender_id) then raise exception 'chat_profile_incomplete'; end if;
  if not public.is_active_profile(conversation.initiator_id) or not public.is_active_profile(conversation.recipient_id) then raise exception 'chat_recipient_unavailable'; end if;
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
