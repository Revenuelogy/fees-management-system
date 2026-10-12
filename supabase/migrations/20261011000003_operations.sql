-- =============================================================================
-- Operational RPCs: sessions, charges, enrolment, payments, receipts, imports
-- All are SECURITY DEFINER with an explicit role check at the top.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sessions
-- -----------------------------------------------------------------------------
create function public.create_session(
  p_name          text,
  p_start         date,
  p_end           date,
  p_installments  jsonb,              -- [{number, name, due_date}]
  p_make_current  boolean default false,
  p_copy_from     uuid default null   -- copy fee structure from this session (matched by installment number)
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  r jsonb;
begin
  perform public.assert_writer();
  insert into public.academic_sessions (name, start_date, end_date)
  values (trim(p_name), p_start, p_end)
  returning id into v_id;

  for r in select * from jsonb_array_elements(coalesce(p_installments, '[]'::jsonb)) loop
    insert into public.installments (session_id, number, name, due_date)
    values (v_id, (r ->> 'number')::int,
            coalesce(nullif(trim(r ->> 'name'), ''), 'Installment ' || (r ->> 'number')),
            (r ->> 'due_date')::date);
  end loop;

  if p_copy_from is not null then
    insert into public.fee_structures (class_id, installment_id, fee_head_id, amount)
    select fs.class_id, ni.id, fs.fee_head_id, fs.amount
      from public.fee_structures fs
      join public.installments oi on oi.id = fs.installment_id and oi.session_id = p_copy_from
      join public.installments ni on ni.session_id = v_id and ni.number = oi.number;
  end if;

  if p_make_current then
    perform public.set_current_session(v_id);
  end if;

  perform public.audit('create_session', 'academic_sessions', v_id::text, jsonb_build_object('name', p_name));
  return v_id;
end $$;

create function public.set_current_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_writer();
  update public.academic_sessions set is_current = false where is_current and id <> p_session;
  update public.academic_sessions set is_current = true where id = p_session;
end $$;

-- -----------------------------------------------------------------------------
-- Charges from fee structure
-- -----------------------------------------------------------------------------
create function public.generate_charges(
  p_session   uuid,
  p_class     uuid default null,
  p_student   uuid default null,
  p_overwrite boolean default false    -- also sync amounts of existing structure-generated charges
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count   integer := 0;
  v_deleted integer := 0;
  v_prev    text;
begin
  perform public.assert_writer();
  v_prev := public.set_skip_realloc(true);

  insert into public.student_charges (student_id, session_id, installment_id, fee_head_id, amount, source)
  select e.student_id, e.session_id, fs.installment_id, fs.fee_head_id, fs.amount, 'structure'
    from public.enrollments e
    join public.students st      on st.id = e.student_id and st.status = 'active'
    join public.fee_structures fs on fs.class_id = e.class_id
    join public.installments i   on i.id = fs.installment_id and i.session_id = e.session_id
   where e.session_id = p_session
     and (p_class is null or e.class_id = p_class)
     and (p_student is null or e.student_id = p_student)
     and fs.amount > 0
  on conflict (student_id, installment_id, fee_head_id) do update
     set amount = excluded.amount,
         concession = least(public.student_charges.concession, excluded.amount)
   where p_overwrite
     and public.student_charges.source = 'structure'
     and public.student_charges.amount <> excluded.amount;
  get diagnostics v_count = row_count;

  if p_overwrite then
    delete from public.student_charges sc
     using public.enrollments e
     where e.student_id = sc.student_id
       and e.session_id = sc.session_id
       and sc.session_id = p_session
       and sc.source = 'structure'
       and (p_class is null or e.class_id = p_class)
       and (p_student is null or e.student_id = p_student)
       and not exists (select 1 from public.fee_structures fs
                        where fs.class_id = e.class_id
                          and fs.installment_id = sc.installment_id
                          and fs.fee_head_id = sc.fee_head_id
                          and fs.amount > 0);
    get diagnostics v_deleted = row_count;
  end if;

  perform set_config('fees.skip_realloc', v_prev, true);

  -- re-run allocation for every affected student
  perform public.reallocate_student(e.student_id)
     from public.enrollments e
    where e.session_id = p_session
      and (p_class is null or e.class_id = p_class)
      and (p_student is null or e.student_id = p_student)
      and exists (select 1 from public.payments p where p.student_id = e.student_id);

  return v_count + v_deleted;
end $$;

-- -----------------------------------------------------------------------------
-- Enrolment
-- -----------------------------------------------------------------------------
create function public.enroll_student(
  p_student   uuid,
  p_session   uuid,
  p_class     uuid,
  p_section   text default 'A',
  p_roll_no   text default null,
  p_generate  boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id        uuid;
  v_old_class uuid;
begin
  perform public.assert_writer();
  select class_id into v_old_class from public.enrollments where student_id = p_student and session_id = p_session;

  insert into public.enrollments (student_id, session_id, class_id, section, roll_no)
  values (p_student, p_session, p_class, coalesce(nullif(trim(p_section), ''), 'A'), nullif(trim(p_roll_no), ''))
  on conflict (student_id, session_id) do update
     set class_id = excluded.class_id, section = excluded.section, roll_no = excluded.roll_no
  returning id into v_id;

  if p_generate then
    perform public.generate_charges(p_session, null, p_student, v_old_class is not null and v_old_class <> p_class);
  end if;
  return v_id;
end $$;

-- Promote enrolled students into the next session using a class mapping.
-- p_mapping: [{"from_class": uuid, "to_class": uuid | null}]  (null = passed out)
create function public.promote_students(
  p_from     uuid,
  p_to       uuid,
  p_mapping  jsonb,
  p_generate boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_promoted   integer := 0;
  v_passed     integer := 0;
  v_skipped    integer := 0;
  m            jsonb;
  v_from_class uuid;
  v_to_class   uuid;
  v_cnt        integer;
begin
  perform public.assert_writer();
  if p_from = p_to then raise exception 'Choose two different sessions'; end if;

  for m in select * from jsonb_array_elements(p_mapping) loop
    v_from_class := (m ->> 'from_class')::uuid;
    v_to_class   := nullif(m ->> 'to_class', '')::uuid;

    if v_to_class is null then
      update public.students st set status = 'passed_out'
        from public.enrollments e
       where e.student_id = st.id and e.session_id = p_from and e.class_id = v_from_class
         and st.status = 'active'
         and not exists (select 1 from public.enrollments e2 where e2.student_id = st.id and e2.session_id = p_to);
      get diagnostics v_cnt = row_count;
      v_passed := v_passed + v_cnt;
    else
      insert into public.enrollments (student_id, session_id, class_id, section)
      select e.student_id, p_to, v_to_class, e.section
        from public.enrollments e
        join public.students st on st.id = e.student_id and st.status = 'active'
       where e.session_id = p_from and e.class_id = v_from_class
      on conflict (student_id, session_id) do nothing;
      get diagnostics v_cnt = row_count;
      v_promoted := v_promoted + v_cnt;

      select count(*) - v_cnt into v_cnt
        from public.enrollments e join public.students st on st.id = e.student_id and st.status = 'active'
       where e.session_id = p_from and e.class_id = v_from_class;
      v_skipped := v_skipped + greatest(v_cnt, 0);
    end if;
  end loop;

  if p_generate then
    perform public.generate_charges(p_to, null, null, false);
  end if;

  perform public.audit('promote_students', 'enrollments', p_to::text,
    jsonb_build_object('from', p_from, 'promoted', v_promoted, 'passed_out', v_passed, 'skipped', v_skipped));
  return jsonb_build_object('promoted', v_promoted, 'passed_out', v_passed, 'skipped', v_skipped);
end $$;

-- -----------------------------------------------------------------------------
-- Concessions & withdrawals
-- -----------------------------------------------------------------------------
create function public.apply_concession(
  p_student          uuid,
  p_session          uuid,
  p_fee_head         uuid,       -- null = every fee head
  p_mode             text,       -- 'percent' | 'amount' (paise per installment line) | 'clear'
  p_value            numeric default 0,
  p_from_installment integer default 1
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  perform public.assert_writer();
  if p_mode not in ('percent', 'amount', 'clear') then raise exception 'Unknown concession mode %', p_mode; end if;
  if p_mode = 'percent' and (p_value < 0 or p_value > 100) then raise exception 'Percent must be between 0 and 100'; end if;

  update public.student_charges sc
     set concession = case p_mode
                        when 'percent' then round(sc.amount * p_value / 100)::bigint
                        when 'amount'  then least(sc.amount, greatest(p_value, 0)::bigint)
                        else 0 end
    from public.installments i
   where i.id = sc.installment_id
     and sc.student_id = p_student
     and sc.session_id = p_session
     and (p_fee_head is null or sc.fee_head_id = p_fee_head)
     and i.number >= coalesce(p_from_installment, 1);
  get diagnostics v_count = row_count;

  perform public.audit('apply_concession', 'students', p_student::text,
    jsonb_build_object('session', p_session, 'fee_head', p_fee_head, 'mode', p_mode, 'value', p_value, 'from', p_from_installment));
  return v_count;
end $$;

create function public.withdraw_student(
  p_student     uuid,
  p_left_on     date,
  p_waive_future boolean default true
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer := 0;
begin
  perform public.assert_writer();
  update public.students set status = 'left', left_on = p_left_on where id = p_student;
  if p_waive_future then
    update public.student_charges sc
       set concession = sc.amount,
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

-- Opening (previous-session) dues for a student
create function public.add_opening_due(
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

  select id into v_head from public.fee_heads where lower(name) = lower(coalesce(nullif(trim(p_fee_head), ''), 'Previous Dues'));
  if v_head is null then
    insert into public.fee_heads (name, priority) values (coalesce(nullif(trim(p_fee_head), ''), 'Previous Dues'), 0)
    returning id into v_head;
  end if;

  insert into public.student_charges (student_id, session_id, installment_id, fee_head_id, amount, source, note)
  values (p_student, p_session, v_inst, v_head, p_amount, 'opening', p_note)
  on conflict (student_id, installment_id, fee_head_id) do update
     set amount = public.student_charges.amount + excluded.amount,
         note = coalesce(excluded.note, public.student_charges.note)
  returning id into v_id;
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Receipts & payments
-- -----------------------------------------------------------------------------
create function public.next_receipt_no(p_session uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_no     integer;
  v_prefix text;
  v_code   text;
  v_receipt text;
begin
  select coalesce(nullif(trim(receipt_prefix), ''), 'R') into v_prefix from public.school_settings where id = 1;
  select to_char(start_date, 'YY') || to_char(end_date, 'YY') into v_code from public.academic_sessions where id = p_session;
  loop
    insert into public.receipt_counters (session_id, last_no) values (p_session, 1)
    on conflict (session_id) do update set last_no = public.receipt_counters.last_no + 1
    returning last_no into v_no;
    v_receipt := v_prefix || v_code || '/' || lpad(v_no::text, 5, '0');
    exit when not exists (select 1 from public.payments where receipt_no = v_receipt);
  end loop;
  return v_receipt;
end $$;

create function public.collect_payment(
  p_student   uuid,
  p_amount    bigint,
  p_paid_on   date,
  p_mode      public.payment_mode,
  p_reference text default null,
  p_remarks   text default null,
  p_targets   jsonb default '[]'      -- [{charge_id, amount}]  amounts in paise
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_session  uuid;
  v_receipt  text;
  v_id       uuid;
  v_prev     text;
  v_tsum     bigint;
  v_bad      integer;
begin
  perform public.assert_writer();
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_paid_on > public.fees_today() then raise exception 'Payment date cannot be in the future'; end if;
  if not exists (select 1 from public.students where id = p_student) then raise exception 'Student not found'; end if;

  v_session := public.session_for_date(p_paid_on);
  if v_session is null then
    raise exception 'No academic session covers %. Create the session first.', to_char(p_paid_on, 'DD Mon YYYY');
  end if;

  select coalesce(sum((t ->> 'amount')::bigint), 0),
         count(*) filter (where (t ->> 'amount')::bigint <= 0
                             or not exists (select 1 from public.student_charges sc
                                             where sc.id = (t ->> 'charge_id')::uuid and sc.student_id = p_student))
    into v_tsum, v_bad
    from jsonb_array_elements(coalesce(p_targets, '[]'::jsonb)) t;
  if v_bad > 0 then raise exception 'Invalid allocation lines'; end if;
  if v_tsum > p_amount then raise exception 'Allocated amount exceeds the payment amount'; end if;

  v_receipt := public.next_receipt_no(v_session);
  v_prev := public.set_skip_realloc(true);

  insert into public.payments (receipt_no, student_id, session_id, paid_on, amount, mode, reference_no, remarks, source)
  values (v_receipt, p_student, v_session, p_paid_on, p_amount, p_mode,
          nullif(trim(p_reference), ''), nullif(trim(p_remarks), ''), 'app')
  returning id into v_id;

  insert into public.payment_targets (payment_id, charge_id, amount)
  select v_id, (t ->> 'charge_id')::uuid, sum((t ->> 'amount')::bigint)
    from jsonb_array_elements(coalesce(p_targets, '[]'::jsonb)) t
   group by (t ->> 'charge_id')::uuid;

  perform set_config('fees.skip_realloc', v_prev, true);
  perform public.reallocate_student(p_student);

  perform public.audit('collect_payment', 'payments', v_id::text,
    jsonb_build_object('receipt_no', v_receipt, 'amount', p_amount, 'student', p_student));
  return jsonb_build_object('payment_id', v_id, 'receipt_no', v_receipt);
end $$;

create function public.cancel_payment(p_payment uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_orig    public.payments;
  v_today   date := public.fees_today();
  v_id      uuid;
  v_session uuid;
begin
  perform public.assert_writer();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to cancel a receipt'; end if;

  select * into v_orig from public.payments where id = p_payment for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_orig.amount < 0 then raise exception 'This row is already a cancellation'; end if;
  if exists (select 1 from public.payments where reverses_payment_id = p_payment) then
    raise exception 'Receipt % is already cancelled', v_orig.receipt_no;
  end if;

  v_session := coalesce(public.session_for_date(v_today), v_orig.session_id);

  insert into public.payments (receipt_no, student_id, session_id, paid_on, amount, mode, reference_no,
                               remarks, source, reverses_payment_id)
  values (v_orig.receipt_no || '-C', v_orig.student_id, v_session, greatest(v_today, v_orig.paid_on),
          -v_orig.amount, v_orig.mode, v_orig.reference_no, 'Cancelled: ' || trim(p_reason), 'app', p_payment)
  returning id into v_id;

  perform public.audit('cancel_payment', 'payments', p_payment::text,
    jsonb_build_object('receipt_no', v_orig.receipt_no, 'reason', p_reason, 'reversal_id', v_id));
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Student search (fast typeahead)
-- -----------------------------------------------------------------------------
create function public.search_students(p_query text, p_limit integer default 15)
returns table (
  id            uuid,
  admission_no  text,
  full_name     text,
  father_name   text,
  phone         text,
  status        public.student_status,
  class_name    text,
  section       text,
  roll_no       text
)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  q text := lower(trim(coalesce(p_query, '')));
  v_session uuid;
begin
  perform public.assert_staff();
  if q = '' then return; end if;
  select s.id into v_session from public.academic_sessions s where s.is_current;

  return query
  select st.id, st.admission_no, st.full_name, st.father_name, st.phone, st.status,
         c.name, e.section, e.roll_no
    from public.students st
    left join lateral (
      select e2.class_id, e2.section, e2.roll_no
        from public.enrollments e2
        join public.academic_sessions s2 on s2.id = e2.session_id
       where e2.student_id = st.id
       order by (e2.session_id = v_session) desc, s2.start_date desc
       limit 1
    ) e on true
    left join public.classes c on c.id = e.class_id
   where st.search_text like '%' || q || '%'
      or st.search_text % q
   order by (lower(st.admission_no) = q) desc,
            (lower(st.admission_no) like q || '%') desc,
            (lower(st.full_name) like q || '%') desc,
            (st.search_text like '%' || q || '%') desc,
            similarity(st.search_text, q) desc,
            st.admission_no
   limit greatest(1, least(p_limit, 50));
end $$;

-- -----------------------------------------------------------------------------
-- Imports (rows pre-parsed by the app; amounts in paise, dates ISO)
-- -----------------------------------------------------------------------------
create function public.import_students(p_session uuid, p_rows jsonb, p_generate boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r         jsonb;
  v_row     integer := 0;
  v_created integer := 0;
  v_updated integer := 0;
  v_enrolled integer := 0;
  v_errors  jsonb := '[]';
  v_student uuid;
  v_class   uuid;
  v_is_new  boolean;
  v_prev    text;
begin
  perform public.assert_writer();
  v_prev := public.set_skip_realloc(true);

  for r in select * from jsonb_array_elements(p_rows) loop
    v_row := v_row + 1;
    begin
      if coalesce(trim(r ->> 'admission_no'), '') = '' or coalesce(trim(r ->> 'full_name'), '') = '' then
        raise exception 'admission_no and full_name are required';
      end if;

      v_class := null;
      if coalesce(trim(r ->> 'class'), '') <> '' then
        select id into v_class from public.classes where lower(name) = lower(trim(r ->> 'class'));
        if v_class is null then raise exception 'Unknown class "%"', r ->> 'class'; end if;
      end if;

      insert into public.students (admission_no, full_name, father_name, mother_name, phone, alt_phone, email,
                                   dob, gender, address, admission_date, erp_id)
      values (trim(r ->> 'admission_no'), trim(r ->> 'full_name'), nullif(trim(r ->> 'father_name'), ''),
              nullif(trim(r ->> 'mother_name'), ''), nullif(trim(r ->> 'phone'), ''), nullif(trim(r ->> 'alt_phone'), ''),
              nullif(trim(r ->> 'email'), ''), nullif(r ->> 'dob', '')::date,
              nullif(upper(left(trim(r ->> 'gender'), 1)), ''), nullif(trim(r ->> 'address'), ''),
              nullif(r ->> 'admission_date', '')::date, nullif(trim(r ->> 'erp_id'), ''))
      on conflict (admission_no) do update set
        full_name      = excluded.full_name,
        father_name    = coalesce(excluded.father_name, public.students.father_name),
        mother_name    = coalesce(excluded.mother_name, public.students.mother_name),
        phone          = coalesce(excluded.phone, public.students.phone),
        alt_phone      = coalesce(excluded.alt_phone, public.students.alt_phone),
        email          = coalesce(excluded.email, public.students.email),
        dob            = coalesce(excluded.dob, public.students.dob),
        gender         = coalesce(excluded.gender, public.students.gender),
        address        = coalesce(excluded.address, public.students.address),
        admission_date = coalesce(excluded.admission_date, public.students.admission_date)
      returning id, (xmax = 0) into v_student, v_is_new;

      if v_is_new then v_created := v_created + 1; else v_updated := v_updated + 1; end if;

      if v_class is not null and p_session is not null then
        insert into public.enrollments (student_id, session_id, class_id, section, roll_no)
        values (v_student, p_session, v_class, coalesce(nullif(trim(r ->> 'section'), ''), 'A'), nullif(trim(r ->> 'roll_no'), ''))
        on conflict (student_id, session_id) do update
          set class_id = excluded.class_id, section = excluded.section, roll_no = coalesce(excluded.roll_no, public.enrollments.roll_no);
        v_enrolled := v_enrolled + 1;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row', v_row, 'message', sqlerrm);
    end;
  end loop;

  perform set_config('fees.skip_realloc', v_prev, true);
  if p_generate and p_session is not null then
    perform public.generate_charges(p_session, null, null, false);
  end if;

  perform public.audit('import_students', 'students', null,
    jsonb_build_object('created', v_created, 'updated', v_updated, 'enrolled', v_enrolled, 'errors', jsonb_array_length(v_errors)));
  return jsonb_build_object('created', v_created, 'updated', v_updated, 'enrolled', v_enrolled, 'errors', v_errors);
end $$;

create function public.import_payments(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r          jsonb;
  v_row      integer := 0;
  v_inserted integer := 0;
  v_dupes    integer := 0;
  v_errors   jsonb := '[]';
  v_student  uuid;
  v_session  uuid;
  v_paid_on  date;
  v_amount   bigint;
  v_receipt  text;
  v_sh       uuid;
  v_fh       uuid;
  v_ih       uuid;
  v_prev     text;
  v_students uuid[] := '{}';
  s          uuid;
begin
  perform public.assert_writer();
  v_prev := public.set_skip_realloc(true);

  for r in select * from jsonb_array_elements(p_rows) loop
    v_row := v_row + 1;
    begin
      select id into v_student from public.students where admission_no = trim(r ->> 'admission_no');
      if v_student is null then raise exception 'Unknown admission_no "%"', r ->> 'admission_no'; end if;
      v_paid_on := (r ->> 'paid_on')::date;
      if v_paid_on is null then raise exception 'paid_on is required'; end if;
      if v_paid_on > public.fees_today() then raise exception 'Payment date % is in the future', v_paid_on; end if;
      v_amount  := (r ->> 'amount')::bigint;
      if v_amount is null or v_amount <= 0 then raise exception 'Amount must be positive'; end if;
      v_session := public.session_for_date(v_paid_on);
      if v_session is null then raise exception 'No session covers %', v_paid_on; end if;

      v_receipt := nullif(trim(r ->> 'receipt_no'), '');
      if v_receipt is not null and exists (select 1 from public.payments where receipt_no = v_receipt) then
        v_dupes := v_dupes + 1;
        continue;
      end if;
      if v_receipt is null then v_receipt := public.next_receipt_no(v_session); end if;

      v_sh := null; v_fh := null; v_ih := null;
      if coalesce(trim(r ->> 'session'), '') <> '' then
        select id into v_sh from public.academic_sessions where name = trim(r ->> 'session');
        if v_sh is null then raise exception 'Unknown session "%"', r ->> 'session'; end if;
      end if;
      if coalesce(trim(r ->> 'fee_head'), '') <> '' then
        select id into v_fh from public.fee_heads where lower(name) = lower(trim(r ->> 'fee_head'));
        if v_fh is null then raise exception 'Unknown fee head "%"', r ->> 'fee_head'; end if;
      end if;
      if coalesce(trim(r ->> 'installment'), '') <> '' then
        select id into v_ih from public.installments
         where session_id = coalesce(v_sh, v_session) and number = (r ->> 'installment')::int;
        if v_ih is null then raise exception 'Unknown installment "%"', r ->> 'installment'; end if;
      end if;

      insert into public.payments (receipt_no, student_id, session_id, paid_on, amount, mode, reference_no, remarks,
                                   session_hint_id, fee_head_hint_id, installment_hint_id, source, erp_id)
      values (v_receipt, v_student, v_session, v_paid_on, v_amount,
              coalesce(nullif(lower(trim(r ->> 'mode')), ''), 'cash')::public.payment_mode,
              nullif(trim(r ->> 'reference_no'), ''), nullif(trim(r ->> 'remarks'), ''),
              v_sh, v_fh, v_ih, 'import', nullif(trim(r ->> 'erp_id'), ''));
      v_inserted := v_inserted + 1;
      if not v_student = any (v_students) then v_students := v_students || v_student; end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row', v_row, 'message', sqlerrm);
    end;
  end loop;

  perform set_config('fees.skip_realloc', v_prev, true);
  foreach s in array v_students loop
    perform public.reallocate_student(s);
  end loop;

  perform public.audit('import_payments', 'payments', null,
    jsonb_build_object('inserted', v_inserted, 'duplicates', v_dupes, 'errors', jsonb_array_length(v_errors)));
  return jsonb_build_object('inserted', v_inserted, 'duplicates', v_dupes, 'errors', v_errors);
end $$;

create function public.import_opening_dues(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r          jsonb;
  v_row      integer := 0;
  v_inserted integer := 0;
  v_errors   jsonb := '[]';
  v_student  uuid;
  v_session  uuid;
  v_class    uuid;
  v_prev     text;
  v_students uuid[] := '{}';
  s          uuid;
begin
  perform public.assert_writer();
  v_prev := public.set_skip_realloc(true);

  for r in select * from jsonb_array_elements(p_rows) loop
    v_row := v_row + 1;
    begin
      select id into v_student from public.students where admission_no = trim(r ->> 'admission_no');
      if v_student is null then raise exception 'Unknown admission_no "%"', r ->> 'admission_no'; end if;
      select id into v_session from public.academic_sessions where name = trim(r ->> 'session');
      if v_session is null then raise exception 'Unknown session "%"', r ->> 'session'; end if;

      if coalesce(trim(r ->> 'class'), '') <> '' then
        select id into v_class from public.classes where lower(name) = lower(trim(r ->> 'class'));
        if v_class is null then raise exception 'Unknown class "%"', r ->> 'class'; end if;
        insert into public.enrollments (student_id, session_id, class_id, section)
        values (v_student, v_session, v_class, coalesce(nullif(trim(r ->> 'section'), ''), 'A'))
        on conflict (student_id, session_id) do nothing;
      end if;

      perform public.add_opening_due(v_student, v_session, (r ->> 'amount')::bigint,
                                     coalesce(nullif(trim(r ->> 'fee_head'), ''), 'Previous Dues'),
                                     nullif(trim(r ->> 'note'), ''));
      v_inserted := v_inserted + 1;
      if not v_student = any (v_students) then v_students := v_students || v_student; end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row', v_row, 'message', sqlerrm);
    end;
  end loop;

  perform set_config('fees.skip_realloc', v_prev, true);
  foreach s in array v_students loop
    perform public.reallocate_student(s);
  end loop;

  perform public.audit('import_opening_dues', 'student_charges', null,
    jsonb_build_object('inserted', v_inserted, 'errors', jsonb_array_length(v_errors)));
  return jsonb_build_object('inserted', v_inserted, 'errors', v_errors);
end $$;
