-- Ztlumení kategorií se týká pouze Web Push. Důležité změny musí vždy zůstat
-- dostupné v interním centru oznámení.
create or replace function public.capture_academic_event_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare fields text[] := '{}';
declare kind text := 'multiple';
declare next_sequence integer;
begin
  if new.title is distinct from old.title then fields := array_append(fields,'title'); end if;
  if new.description is distinct from old.description then fields := array_append(fields,'description'); end if;
  if new.starts_at is distinct from old.starts_at then fields := array_append(fields,'starts_at'); end if;
  if new.ends_at is distinct from old.ends_at then fields := array_append(fields,'ends_at'); end if;
  if new.is_cancelled is distinct from old.is_cancelled then fields := array_append(fields,'is_cancelled'); end if;
  if cardinality(fields) = 0 then return new; end if;
  next_sequence := old.revision_sequence + 1;
  new.revision_sequence := next_sequence;
  new.previous_verified_data := jsonb_build_object('title',old.title,'description',old.description,'starts_at',old.starts_at,'ends_at',old.ends_at,'is_cancelled',old.is_cancelled);
  new.changed_at := now();
  if fields = array['starts_at']::text[] or fields = array['ends_at']::text[] then kind := 'date';
  elsif fields = array['description']::text[] or fields = array['title']::text[] then kind := 'description';
  elsif new.is_cancelled then kind := 'cancelled'; end if;
  insert into public.academic_event_changes(academic_event_id,source_id,change_type,changed_fields,previous_data,current_data,severity,verified_at)
    values (new.id,new.source_id,kind,fields,to_jsonb(old),to_jsonb(new),case when new.is_cancelled then 'critical' else 'important' end,coalesce(new.last_verified_at,now()));
  insert into public.internal_notifications(installation_id,target_type,target_id,kind,title,body,destination_url,dedupe_key)
    select i.id,'academic_event',new.id,'academic_change','Změna školního termínu',new.title,
      '/brno/kalendar#' || new.id,'academic-change:' || new.id || ':' || next_sequence
    from public.anonymous_installations i
    where coalesce(new.city_id,'brno') = i.city_id
      and (new.university_id is null or new.university_id = i.university_id)
      and (new.faculty_id is null or new.faculty_id = i.faculty_id)
      and (new.study_years is null or cardinality(new.study_years) = 0 or i.study_year = any(new.study_years))
    on conflict (installation_id,dedupe_key) do nothing;
  return new;
end;
$$;

create or replace function public.notify_new_important_academic_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'approved' or new.verification_status <> 'verified' or new.is_demo or new.is_cancelled then return new; end if;
  if new.category::text not in ('course_registration','course_enrollment','seminar_enrollment','enrollment_changes','timetable_release','exam','final_exam_application','final_exam','thesis_deadline','dean_rector_leave') then return new; end if;
  insert into public.internal_notifications(installation_id,target_type,target_id,kind,title,body,destination_url,dedupe_key)
    select i.id,'academic_event',new.id,'new_important_term','Nový důležitý školní termín',new.title,
      '/brno/kalendar#' || new.id,'academic-new:' || new.id
    from public.anonymous_installations i
    where coalesce(new.city_id,'brno') = i.city_id
      and (new.university_id is null or new.university_id = i.university_id)
      and (new.faculty_id is null or new.faculty_id = i.faculty_id)
      and (new.study_years is null or cardinality(new.study_years) = 0 or i.study_year = any(new.study_years))
    on conflict (installation_id,dedupe_key) do nothing;
  return new;
end;
$$;
