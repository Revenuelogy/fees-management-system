-- =============================================================================
-- One installment, or one fee type, for every student of a class
--
-- class_fee_lines(session, class, installment, fee_head, section): each student enrolled in the class (and section)
-- with what they must pay for the chosen installment and/or fee type this year (after concessions), what was
-- received against it (whenever it was paid), what remains, how much of that is due till today (charges whose
-- due date has passed) and a status: paid (nothing remains), partial, not_paid, or nothing (no such fee). Also the
-- totals, and the installments and fee types the class has fees for (to choose from).
-- The figures use the same charges and allocations as class_detail(), so the installment totals match its strip.
-- =============================================================================

create function public.class_fee_lines(
  p_session     uuid,
  p_class       uuid,
  p_installment uuid default null,
  p_fee_head    uuid default null,
  p_section     text default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.fees_today();
  v_rows  jsonb;
  v_sum   jsonb;
  v_opts  jsonb;
begin
  perform public.assert_staff();
  perform public.assert_sees_school();
  if not exists (select 1 from public.academic_sessions where id = p_session) then raise exception 'Unknown session'; end if;
  if not exists (select 1 from public.classes where id = p_class) then raise exception 'Unknown class'; end if;
  if p_installment is not null and not exists (select 1 from public.installments where id = p_installment and session_id = p_session) then
    raise exception 'Unknown installment';
  end if;
  if p_fee_head is not null and not exists (select 1 from public.fee_heads where id = p_fee_head) then raise exception 'Unknown fee type'; end if;

  with stu as (
    select e.student_id, e.section, e.roll_no
      from public.enrollments e
     where e.session_id = p_session and e.class_id = p_class and (p_section is null or e.section = p_section)
  ),
  ch as (
    select sc.student_id, sc.net_amount, sc.concession, i.due_date, coalesce(al.amt, 0) as received
      from public.student_charges sc
      join public.installments i on i.id = sc.installment_id
      left join (select charge_id, sum(amount) amt from public.allocations where session_id = p_session group by charge_id) al
             on al.charge_id = sc.id
     where sc.session_id = p_session and sc.student_id in (select stu.student_id from stu)
       and (p_installment is null or sc.installment_id = p_installment)
       and (p_fee_head is null or sc.fee_head_id = p_fee_head)
  ),
  per as (
    select stu.student_id, stu.section, stu.roll_no,
           coalesce(sum(ch.net_amount), 0)::bigint as to_pay,
           coalesce(sum(ch.concession), 0)::bigint as concession,
           coalesce(sum(least(ch.received, ch.net_amount)), 0)::bigint as received,
           coalesce(sum(greatest(ch.net_amount - ch.received, 0)), 0)::bigint as remaining,
           coalesce(sum(greatest(ch.net_amount - ch.received, 0)) filter (where ch.due_date <= v_today), 0)::bigint as due_now
      from stu
      left join ch on ch.student_id = stu.student_id
     group by stu.student_id, stu.section, stu.roll_no
  ),
  r as (
    select per.*, st.full_name, st.admission_no, st.father_name, st.phone,
           case when per.to_pay <= 0 then 'nothing'
                when per.remaining <= 0 then 'paid'
                when per.received > 0 then 'partial'
                else 'not_paid' end as status
      from per join public.students st on st.id = per.student_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'student_id', r.student_id, 'full_name', r.full_name, 'admission_no', r.admission_no, 'father_name', r.father_name,
           'phone', r.phone, 'section', r.section, 'roll_no', r.roll_no,
           'to_pay', r.to_pay, 'concession', r.concession, 'received', r.received, 'remaining', r.remaining,
           'due_now', r.due_now, 'due_later', r.remaining - r.due_now, 'status', r.status
         ) order by r.section, nullif(regexp_replace(coalesce(r.roll_no, ''), '\D', '', 'g'), '')::numeric nulls last, r.full_name), '[]'::jsonb),
         jsonb_build_object(
           'students', count(*), 'to_pay', coalesce(sum(r.to_pay), 0), 'concession', coalesce(sum(r.concession), 0),
           'received', coalesce(sum(r.received), 0), 'remaining', coalesce(sum(r.remaining), 0),
           'due_now', coalesce(sum(r.due_now), 0), 'due_later', coalesce(sum(r.remaining - r.due_now), 0),
           'paid', count(*) filter (where r.status = 'paid'), 'partial', count(*) filter (where r.status = 'partial'),
           'not_paid', count(*) filter (where r.status = 'not_paid'), 'nothing', count(*) filter (where r.status = 'nothing'),
           'received_pct', case when sum(r.to_pay) > 0 then round(100.0 * sum(r.received) / sum(r.to_pay)) end)
    into v_rows, v_sum
    from r;

  -- what there is to choose from: the installments and fee types this class has fees for this year
  with cs as (
    select sc.installment_id, sc.fee_head_id
      from public.student_charges sc
     where sc.session_id = p_session
       and sc.student_id in (select e.student_id from public.enrollments e where e.session_id = p_session and e.class_id = p_class)
  )
  select jsonb_build_object(
           'installments', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'name', i.name, 'due_date', i.due_date)
                                                      order by i.number), '[]'::jsonb)
                              from public.installments i where i.id in (select cs.installment_id from cs)),
           'fee_heads', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name) order by h.priority, h.name), '[]'::jsonb)
                           from public.fee_heads h where h.id in (select cs.fee_head_id from cs)))
    into v_opts;

  return jsonb_build_object(
    'today', v_today,
    'installment', (select jsonb_build_object('id', i.id, 'number', i.number, 'name', i.name, 'due_date', i.due_date)
                      from public.installments i where i.id = p_installment),
    'fee_head', (select jsonb_build_object('id', h.id, 'name', h.name) from public.fee_heads h where h.id = p_fee_head),
    'options', v_opts,
    'summary', v_sum,
    'rows', v_rows
  );
end $$;

revoke execute on all functions in schema public from public;
