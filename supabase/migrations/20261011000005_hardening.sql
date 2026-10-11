-- =============================================================================
-- Hardening
--   * internal helpers are not callable through the API
--   * audit() requires a writer
--   * the school can never be left without an admin
--   * opening dues never merge into fee-structure lines
--   * withdrawing a student remembers concessions so re-activation can restore them
-- =============================================================================

-- audit(): only staff who can change data may write audit rows -----------------
create or replace function public.audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_writer();
  insert into public.audit_log (action, entity, entity_id, details) values (p_action, p_entity, p_entity_id, p_details);
end $$;

-- Internal helpers: callable only by other SECURITY DEFINER functions and triggers
revoke execute on function public.next_receipt_no(uuid) from public, anon, authenticated;
revoke execute on function public.reallocate_student(uuid) from public, anon, authenticated;
revoke execute on function public.reallocate_all() from public, anon, authenticated;
revoke execute on function public.month_target_charges(date, boolean, boolean) from public, anon, authenticated;
revoke execute on function public.set_skip_realloc(boolean) from public, anon, authenticated;

-- At least one admin must remain --------------------------------------------------
create function public.profiles_keep_one_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role is distinct from 'admin')
     and not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
    raise exception 'The school must keep at least one admin. Make someone else admin first.' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger profiles_keep_one_admin
  before update of role or delete on public.profiles
  for each row execute function public.profiles_keep_one_admin();

-- Opening dues: refuse to merge into a structure / manual line ---------------------
create or replace function public.add_opening_due(
  p_student  uuid,
  p_session  uuid,
  p_amount   bigint,
  p_fee_head text default 'Previous Dues',
  p_note     text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_inst uuid;
  v_head uuid;
  v_id   uuid;
  v_name text := coalesce(nullif(trim(p_fee_head), ''), 'Previous Dues');
begin
  perform public.assert_writer();
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  -- opening dues sit on the session's first installment with a top-priority fee head,
  -- so the default rule clears them before anything else in that session
  select id into v_inst from public.installments where session_id = p_session order by number limit 1;
  if v_inst is null then
    insert into public.installments (session_id, number, name, due_date)
    select p_session, 1, 'Opening balance', start_date from public.academic_sessions where id = p_session
    returning id into v_inst;
  end if;

  select id into v_head from public.fee_heads where lower(name) = lower(v_name);
  if v_head is null then
    insert into public.fee_heads (name, priority) values (v_name, 0) returning id into v_head;
  end if;

  if exists (select 1 from public.student_charges
              where student_id = p_student and installment_id = v_inst and fee_head_id = v_head and source <> 'opening') then
    raise exception 'This student already has a "%" charge on that installment. Use a separate fee head for old dues, such as "Previous Dues".', v_name;
  end if;

  insert into public.student_charges (student_id, session_id, installment_id, fee_head_id, amount, source, note)
  values (p_student, p_session, v_inst, v_head, p_amount, 'opening', p_note)
  on conflict (student_id, installment_id, fee_head_id) do update
     set amount = public.student_charges.amount + excluded.amount,
         note = coalesce(excluded.note, public.student_charges.note)
  returning id into v_id;

  perform public.audit('add_opening_due', 'student_charges', v_id::text,
    jsonb_build_object('student', p_student, 'session', p_session, 'amount', p_amount, 'fee_head', v_name));
  return v_id;
end $$;

-- Withdraw / re-activate ---------------------------------------------------------
alter table public.student_charges add column concession_before_waiver bigint;

create or replace function public.withdraw_student(
  p_student      uuid,
  p_left_on      date,
  p_waive_future boolean default true
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer := 0;
begin
  perform public.assert_writer();
  update public.students set status = 'left', left_on = p_left_on where id = p_student;
  if p_waive_future then
    update public.student_charges sc
       set concession_before_waiver = coalesce(sc.concession_before_waiver, sc.concession),
           concession = sc.amount,
           note = coalesce(sc.note || ' | ', '') || 'Waived: left on ' || to_char(p_left_on, 'DD Mon YYYY')
      from public.installments i
     where i.id = sc.installment_id
       and sc.student_id = p_student
       and i.due_date > p_left_on
       and sc.concession < sc.amount;
    get diagnostics v_count = row_count;
  end if;
  perform public.audit('withdraw_student', 'students', p_student::text,
    jsonb_build_object('left_on', p_left_on, 'waived_lines', v_count));
  return v_count;
end $$;

create function public.reactivate_student(p_student uuid, p_restore boolean default true) returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer := 0;
begin
  perform public.assert_writer();
  update public.students set status = 'active', left_on = null where id = p_student;
  if p_restore then
    update public.student_charges
       set concession = least(coalesce(concession_before_waiver, 0), amount),
           concession_before_waiver = null,
           note = nullif(regexp_replace(coalesce(note, ''), '( \| )?Waived: left on [0-9]{2} [A-Za-z]{3} [0-9]{4}', '', 'g'), '')
     where student_id = p_student
       and concession_before_waiver is not null;
    get diagnostics v_count = row_count;
  end if;
  perform public.audit('reactivate_student', 'students', p_student::text,
    jsonb_build_object('restored_lines', v_count));
  return v_count;
end $$;

revoke execute on function public.reactivate_student(uuid, boolean) from public, anon;
grant execute on function public.reactivate_student(uuid, boolean) to authenticated, service_role;
revoke execute on function public.profiles_keep_one_admin() from public, anon, authenticated;
