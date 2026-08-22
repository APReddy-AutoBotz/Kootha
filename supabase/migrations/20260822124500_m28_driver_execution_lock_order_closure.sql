-- M28 final lock-order closure: serialize the active Driver execution authority
-- before any day/parent row lock so it cannot deadlock with M21/M28 mutations.
set search_path = public;

create or replace function public.driver_update_work_day(
  p_mobile text,
  p_work_code text,
  p_ad_work_day_id uuid,
  p_action text,
  p_note text default null,
  p_area_place_name text default null,
  p_proof_type text default null
)
returns table(ad_work_day_id uuid, execution_status text, result_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad_work public.ad_works%rowtype;
  v_day public.ad_work_days%rowtype;
  v_assignment public.ad_work_assignments%rowtype;
  v_driver public.drivers%rowtype;
  v_note text;
  v_type text;
  v_message text;
begin
  -- Canonical M21/M28 authority order: advisory lock first, then row authority.
  -- The M21 statement triggers may acquire this lock again later in this same
  -- transaction; PostgreSQL advisory transaction locks are re-entrant here.
  perform pg_advisory_xact_lock(hashtextextended('m21-authority-global', 2100));

  v_note := nullif(trim(coalesce(p_note, '')), '');
  v_type := coalesce(nullif(trim(p_proof_type), ''), 'other');

  select aw.* into v_ad_work
  from public.ad_works aw
  join public.ad_work_assignments assignment on assignment.ad_work_id = aw.id
  join public.drivers driver_record on driver_record.id = assignment.driver_id
  where aw.execution_release_status = 'released_to_driver'
    and aw.work_access_code_hash = public.m6_hash_work_code(p_work_code)
    and public.m6_normalize_mobile(driver_record.phone) = public.m6_normalize_mobile(p_mobile)
  limit 1;

  if not found then
    raise exception 'Invalid work code or mobile number' using errcode = '42501';
  end if;

  select * into v_day
  from public.ad_work_days
  where id = p_ad_work_day_id
    and ad_work_id = v_ad_work.id
  for update;

  if not found then
    raise exception 'Work day not found' using errcode = 'P0002';
  end if;

  select * into v_assignment
  from public.ad_work_assignments
  where ad_work_id = v_ad_work.id;

  select * into v_driver
  from public.drivers
  where id = v_assignment.driver_id;

  if p_action = 'start' then
    if v_day.execution_status not in ('planned', 'ready') then
      raise exception 'Start Work is allowed only for Planned or Ready work' using errcode = '22000';
    end if;

    update public.ad_work_days
    set execution_status = 'running',
        execution_started_at = coalesce(execution_started_at, now()),
        execution_updated_at = now()
    where id = v_day.id;

    update public.ad_works
    set execution_overall_status = 'running',
        updated_at = now()
    where id = v_ad_work.id;

    v_message := 'Your advertisement work has started.';
    insert into public.customer_updates (ad_work_id, ad_work_day_id, type, message, channel, sent_status)
    values (v_ad_work.id, v_day.id, 'started', v_message, 'copy', 'draft');

    return query select v_day.id, 'running'::text, 'Start Work saved.'::text;
    return;
  end if;

  if p_action = 'take_break' then
    if v_day.execution_status <> 'running' then
      raise exception 'Take Break is allowed only when work is Running' using errcode = '22000';
    end if;

    update public.ad_work_days
    set execution_status = 'on_break',
        break_started_at = now(),
        execution_updated_at = now()
    where id = v_day.id;

    update public.ad_works
    set execution_overall_status = 'on_break',
        updated_at = now()
    where id = v_ad_work.id;

    v_message := 'Your advertisement work is currently paused for a driver break.';
    insert into public.customer_updates (ad_work_id, ad_work_day_id, type, message, channel, sent_status)
    values (v_ad_work.id, v_day.id, 'manual', v_message, 'copy', 'draft');

    return query select v_day.id, 'on_break'::text, 'Take Break saved.'::text;
    return;
  end if;

  if p_action = 'resume' then
    if v_day.execution_status <> 'on_break' then
      raise exception 'Resume Work is allowed only when work is On Break' using errcode = '22000';
    end if;

    update public.ad_work_days
    set execution_status = 'running',
        last_resumed_at = now(),
        execution_updated_at = now()
    where id = v_day.id;

    update public.ad_works
    set execution_overall_status = 'running',
        updated_at = now()
    where id = v_ad_work.id;

    v_message := 'Your advertisement work is currently running.';
    insert into public.customer_updates (ad_work_id, ad_work_day_id, type, message, channel, sent_status)
    values (v_ad_work.id, v_day.id, 'in_progress', v_message, 'copy', 'draft');

    return query select v_day.id, 'running'::text, 'Resume Work saved.'::text;
    return;
  end if;

  if p_action = 'end' then
    if v_day.execution_status not in ('running', 'on_break') then
      raise exception 'End Work is allowed only when work is Running or On Break' using errcode = '22000';
    end if;

    if v_note is null then
      raise exception 'Completion note is required' using errcode = '22000';
    end if;

    update public.ad_work_days
    set execution_status = 'completed',
        execution_completed_at = now(),
        completion_note = v_note,
        execution_updated_at = now()
    where id = v_day.id;

    if not exists (
      select 1 from public.ad_work_days
      where ad_work_id = v_ad_work.id
        and id <> v_day.id
        and execution_status <> 'completed'
    ) then
      update public.ad_works
      set execution_overall_status = 'completed',
          execution_completed_at = now(),
          updated_at = now()
      where id = v_ad_work.id;
    end if;

    v_message := 'Today''s advertisement work is completed.';
    insert into public.customer_updates (ad_work_id, ad_work_day_id, type, message, channel, sent_status)
    values (v_ad_work.id, v_day.id, 'completed', v_message, 'copy', 'draft');

    return query select v_day.id, 'completed'::text, 'Work Completed.'::text;
    return;
  end if;

  if p_action = 'issue' then
    if v_note is null then
      raise exception 'Issue note is required' using errcode = '22000';
    end if;

    update public.ad_work_days
    set execution_status = 'issue_reported',
        issue_note = v_note,
        execution_updated_at = now()
    where id = v_day.id;

    update public.ad_works
    set execution_overall_status = 'issue_reported',
        updated_at = now()
    where id = v_ad_work.id;

    insert into public.execution_proof_notes (ad_work_id, ad_work_day_id, driver_id, proof_type, area_place_name, note_text)
    values (v_ad_work.id, v_day.id, v_driver.id, 'issue', nullif(trim(coalesce(p_area_place_name, '')), ''), v_note);

    v_message := 'Your work had an issue and our team is checking it.';
    insert into public.customer_updates (ad_work_id, ad_work_day_id, type, message, channel, sent_status)
    values (v_ad_work.id, v_day.id, 'manual', v_message, 'copy', 'draft');

    return query select v_day.id, 'issue_reported'::text, 'Issue Reported.'::text;
    return;
  end if;

  if p_action = 'add_proof_note' then
    if v_note is null then
      raise exception 'Proof note is required' using errcode = '22000';
    end if;

    if v_type not in ('area_covered', 'announcement_done', 'customer_request', 'issue', 'other') then
      raise exception 'Invalid proof note type' using errcode = '22000';
    end if;

    insert into public.execution_proof_notes (ad_work_id, ad_work_day_id, driver_id, proof_type, area_place_name, note_text)
    values (v_ad_work.id, v_day.id, v_driver.id, v_type, nullif(trim(coalesce(p_area_place_name, '')), ''), v_note);

    v_message := 'A proof note was added for your advertisement work.';
    insert into public.customer_updates (ad_work_id, ad_work_day_id, type, message, channel, sent_status)
    values (
      v_ad_work.id,
      v_day.id,
      case when v_type = 'area_covered' then 'area_covered'::public.customer_update_type else 'manual'::public.customer_update_type end,
      v_message,
      'copy',
      'draft'
    );

    return query select v_day.id, v_day.execution_status, 'Proof Note added.'::text;
    return;
  end if;

  raise exception 'Unsupported work action' using errcode = '22000';
end;
$$;

revoke all on function public.driver_update_work_day(text, text, uuid, text, text, text, text) from public;
grant execute on function public.driver_update_work_day(text, text, uuid, text, text, text, text) to anon;
