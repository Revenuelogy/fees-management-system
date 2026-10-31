-- =============================================================================
-- Home screen and plain-word figures
--
--   * student_360: each receipt also says what it went to (this year's fees, old balance, paid in advance), so
--     screens can say "It cleared last year's old balance" without adding anything up themselves.
--   * home_*: one function per card of the Home screen, so each card loads (and fails) on its own:
--       home_fees(session)    this year's fees: Total fee, Received, Due now, Due later, Balance, Old balance,
--                             Old balance received, and To recover now (= Due now + Old balance)
--       home_today()          received today and this month, families to call, promises due today, broken
--       home_chase()          the first five families of today's call list (same order as the Calls page)
--       home_classes(session) each class's share of its Total fee received
--     School-wide figures: refused to callers (assert_sees_school).
-- =============================================================================

create or replace function public.student_360(p_student uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_st        public.students;
  v_today     date := public.fees_today();
  v_cur       public.academic_sessions;
  v_enr       jsonb;
  v_sessions  jsonb;
  v_payments  jsonb;
  v_notes     jsonb;
  v_behaviour jsonb;
  v_balance   jsonb;
  v_status    text;
  v_last      jsonb;
begin
  perform public.assert_staff();
  select * into v_st from public.students where id = p_student;
  if not found then raise exception 'Student not found'; end if;
  select * into v_cur from public.academic_sessions where is_current;

  select coalesce(jsonb_agg(jsonb_build_object(
           'session_id', s.id, 'session_name', s.name, 'class_id', c.id, 'class_name', c.name,
           'section', e.section, 'roll_no', e.roll_no, 'is_current', s.is_current
         ) order by s.start_date desc), '[]'::jsonb)
    into v_enr
    from public.enrollments e
    join public.academic_sessions s on s.id = e.session_id
    join public.classes c on c.id = e.class_id
   where e.student_id = p_student;

  -- sessions -> installments -> lines
  with d as (select * from public.student_dues(p_student)),
  inst as (
    select d.session_id, d.installment_id, d.installment_no, d.installment_name, d.due_date,
           sum(d.amount) amount, sum(d.concession) concession, sum(d.net_amount) net, sum(d.paid) paid, sum(d.remaining) remaining,
           jsonb_agg(jsonb_build_object('charge_id', d.charge_id, 'fee_head', d.fee_head, 'amount', d.amount,
                                        'concession', d.concession, 'net', d.net_amount, 'paid', d.paid,
                                        'remaining', d.remaining) order by d.fee_head_priority, d.fee_head) lines
      from d
     group by d.session_id, d.installment_id, d.installment_no, d.installment_name, d.due_date
  ),
  sess as (
    select inst.session_id, sum(inst.amount) amount, sum(inst.concession) concession, sum(inst.net) net,
           sum(inst.paid) paid, sum(inst.remaining) remaining,
           sum(inst.remaining) filter (where inst.due_date <= v_today) overdue,
           jsonb_agg(jsonb_build_object(
             'installment_id', inst.installment_id, 'number', inst.installment_no, 'name', inst.installment_name,
             'due_date', inst.due_date, 'amount', inst.amount, 'concession', inst.concession, 'net', inst.net,
             'paid', inst.paid, 'remaining', inst.remaining,
             'status', case when inst.net = 0 then 'waived'
                            when inst.remaining <= 0 then 'paid'
                            when inst.paid > 0 then case when inst.due_date <= v_today then 'partial_overdue' else 'partial' end
                            when inst.due_date <= v_today then 'overdue'
                            else 'upcoming' end,
             'lines', inst.lines) order by inst.installment_no) installments
      from inst group by inst.session_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'session_id', s.id, 'session_name', s.name, 'start_date', s.start_date, 'end_date', s.end_date,
           'is_current', s.is_current,
           'class_name', c.name, 'section', e.section,
           'amount', sess.amount, 'concession', sess.concession, 'net', sess.net, 'paid', sess.paid,
           'remaining', sess.remaining, 'overdue', coalesce(sess.overdue, 0),
           'installments', sess.installments
         ) order by s.start_date desc), '[]'::jsonb)
    into v_sessions
    from sess
    join public.academic_sessions s on s.id = sess.session_id
    left join public.enrollments e on e.student_id = p_student and e.session_id = s.id
    left join public.classes c on c.id = e.class_id;

  -- payments with allocation and share of outstanding cleared
  with p as (
    select p.*, row_number() over (order by p.paid_on, p.created_at, p.id) as seq,
           s.start_date as pay_start, s.name as session_name
      from public.payments p join public.academic_sessions s on s.id = p.session_id
     where p.student_id = p_student
  ),
  ob as (   -- outstanding (this & earlier sessions) just before each payment
    select p.id,
           (select coalesce(sum(sc.net_amount), 0) from public.student_charges sc
              join public.academic_sessions s2 on s2.id = sc.session_id
             where sc.student_id = p_student and s2.start_date <= p.pay_start)
           -
           (select coalesce(sum(a.amount), 0) from public.allocations a
              join p p2 on p2.id = a.payment_id
              join public.academic_sessions s3 on s3.id = a.session_id
             where p2.seq < p.seq and s3.start_date <= p.pay_start) as outstanding_before
      from p
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'payment_id', p.id, 'receipt_no', p.receipt_no, 'paid_on', p.paid_on, 'amount', p.amount,
           'mode', p.mode, 'reference_no', p.reference_no, 'remarks', p.remarks, 'source', p.source,
           'session_name', p.session_name,
           'is_reversal', p.reverses_payment_id is not null,
           'cancelled', exists (select 1 from public.payments r where r.reverses_payment_id = p.id),
           'outstanding_before', ob.outstanding_before,
           'pct_of_outstanding', case when p.amount > 0 and ob.outstanding_before > 0
                                      then round(100.0 * least(p.amount, ob.outstanding_before) / ob.outstanding_before, 1) end,
           -- what the money went to: this year's fees, old balance of earlier years, or paid in advance
           'current', coalesce((select sum(a.amount) from public.allocations a where a.payment_id = p.id and a.kind = 'current'), 0),
           'arrears', coalesce((select sum(a.amount) from public.allocations a where a.payment_id = p.id and a.kind = 'arrears'), 0),
           'advance', coalesce((select sum(a.amount) from public.allocations a where a.payment_id = p.id and a.kind = 'advance'), 0),
           'allocations', (select coalesce(jsonb_agg(jsonb_build_object(
                                     'session', s.name, 'installment', i.name, 'installment_no', i.number,
                                     'fee_head', fh.name, 'amount', a.amount, 'kind', a.kind, 'is_inferred', a.is_inferred)
                                   order by s.start_date nulls last, i.number, fh.priority), '[]'::jsonb)
                             from public.allocations a
                             left join public.academic_sessions s on s.id = a.session_id
                             left join public.installments i on i.id = a.installment_id
                             left join public.fee_heads fh on fh.id = a.fee_head_id
                            where a.payment_id = p.id)
         ) order by p.paid_on desc, p.created_at desc), '[]'::jsonb)
    into v_payments
    from p join ob on ob.id = p.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id, 'note', n.note, 'promised_date', n.promised_date, 'promised_amount', n.promised_amount,
           'created_at', n.created_at, 'author', pr.full_name
         ) order by n.created_at desc), '[]'::jsonb)
    into v_notes
    from public.student_notes n left join public.profiles pr on pr.id = n.created_by
   where n.student_id = p_student;

  -- payment behaviour, from money that went to charges
  with x as (
    select a.amount, a.paid_on, i.due_date, (a.paid_on - i.due_date) as days,
           extract(month from a.paid_on)::int as mon
      from public.allocations a
      join public.installments i on i.id = a.installment_id
     where a.student_id = p_student and a.amount > 0
  )
  select jsonb_build_object(
           'allocated_amount', coalesce(sum(amount), 0),
           'avg_days_from_due', case when sum(amount) > 0 then round(sum(days * amount)::numeric / sum(amount), 0) end,
           'on_time_pct', case when sum(amount) > 0 then round(100.0 * coalesce(sum(amount) filter (where days <= 0), 0) / sum(amount), 0) end,
           'year_end_pct', case when sum(amount) > 0 then round(100.0 * coalesce(sum(amount) filter (where mon in (1, 2, 3)), 0) / sum(amount), 0) end,
           'profile', case
              when coalesce(sum(amount), 0) = 0 then 'no_history'
              when sum(amount) filter (where mon in (1, 2, 3) and days > 30) > sum(amount) * 0.5 then 'year_end'
              when sum(days * amount)::numeric / sum(amount) <= -7 then 'early'
              when sum(days * amount)::numeric / sum(amount) <= 15 then 'on_time'
              else 'late' end
         )
    into v_behaviour from x;

  if v_cur.id is not null then
    select jsonb_build_object(
             'session_id', v_cur.id, 'session_name', v_cur.name,
             'expected', b.expected, 'received', b.received, 'pending', b.pending, 'overdue', b.overdue,
             'due_expected', b.due_expected, 'prev_opening', b.prev_opening, 'prev_recovered', b.prev_recovered,
             'prev_pending', b.prev_pending, 'total_pending', b.total_pending, 'total_overdue', b.total_overdue,
             'advance_balance', b.advance_balance, 'concession', b.concession, 'last_paid_on', b.last_paid_on,
             'days_since_payment', b.days_since_payment
           ), b.fee_status
      into v_balance, v_status
      from public.student_balances(v_cur.id) b where b.student_id = p_student;
  end if;

  -- last payment split (current vs previous dues)
  select jsonb_build_object(
           'receipt_no', p.receipt_no, 'paid_on', p.paid_on, 'amount', p.amount,
           'current', coalesce(sum(a.amount) filter (where a.kind = 'current'), 0),
           'arrears', coalesce(sum(a.amount) filter (where a.kind = 'arrears'), 0),
           'advance', coalesce(sum(a.amount) filter (where a.kind = 'advance'), 0))
    into v_last
    from public.payments p
    left join public.allocations a on a.payment_id = p.id
   where p.id = (select p2.id from public.payments p2
                  where p2.student_id = p_student and p2.amount > 0
                    and not exists (select 1 from public.payments r where r.reverses_payment_id = p2.id)
                  order by p2.paid_on desc, p2.created_at desc limit 1)
   group by p.receipt_no, p.paid_on, p.amount;

  return jsonb_build_object(
    'student', to_jsonb(v_st) - 'search_text',
    'enrollments', v_enr,
    'current_session', case when v_cur.id is null then null else jsonb_build_object('id', v_cur.id, 'name', v_cur.name) end,
    'balance', v_balance,
    'fee_status', v_status,
    'last_payment', v_last,
    'sessions', v_sessions,
    'payments', v_payments,
    'notes', v_notes,
    'behaviour', v_behaviour,
    'today', v_today
  );
end $$;


-- ---------------------------------------------------------------------------
-- Home: this year's fees and what is left to recover
-- ---------------------------------------------------------------------------
create function public.home_fees(p_session uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sess public.academic_sessions;
  v_out  jsonb;
begin
  perform public.assert_staff();
  perform public.assert_sees_school();
  select * into v_sess from public.academic_sessions where id = p_session;
  if not found then raise exception 'Unknown session'; end if;

  with sb as materialized (select * from public.student_balances(p_session)),
  t as (
    select coalesce(sum(sb.expected), 0)::bigint as total_fee,
           coalesce(sum(sb.received), 0)::bigint as received,
           coalesce(sum(sb.overdue), 0)::bigint as due_now,
           coalesce(sum(sb.pending - sb.overdue), 0)::bigint as due_later,
           coalesce(sum(sb.pending), 0)::bigint as balance,
           coalesce(sum(sb.prev_pending), 0)::bigint as old_balance,
           coalesce(sum(sb.prev_recovered), 0)::bigint as old_balance_received,
           count(*) filter (where sb.overdue + sb.prev_pending > 0) as students,
           count(*) filter (where sb.overdue + sb.prev_pending > 0 and sb.fee_status = 'not_paying') as nothing_paid
      from sb
  )
  select jsonb_build_object(
           'session', jsonb_build_object('id', v_sess.id, 'name', v_sess.name, 'is_current', v_sess.is_current,
                                         'start_date', v_sess.start_date, 'end_date', v_sess.end_date),
           'total_fee', t.total_fee, 'received', t.received, 'due_now', t.due_now, 'due_later', t.due_later,
           'balance', t.balance, 'old_balance', t.old_balance, 'old_balance_received', t.old_balance_received,
           'received_pct', case when t.total_fee > 0 then round(100.0 * t.received / t.total_fee) end,
           'to_recover', t.due_now + t.old_balance,
           'students_to_recover', t.students, 'nothing_paid', t.nothing_paid)
    into v_out
    from t;
  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- Home: today (the money of today and this month by receipt date, as on Payments; calls and promises as on
-- the Calls page)
-- ---------------------------------------------------------------------------
create function public.home_today()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.fees_today();
  v_money jsonb;
  v_calls jsonb;
  v_prom  jsonb;
begin
  perform public.assert_staff();
  perform public.assert_sees_school();

  select jsonb_build_object(
           'received_today', coalesce(sum(p.amount) filter (where p.paid_on = v_today), 0),
           'receipts_today', count(*) filter (where p.paid_on = v_today and p.amount > 0),
           'received_month', coalesce(sum(p.amount), 0),
           'receipts_month', count(*) filter (where p.amount > 0))
    into v_money
    from public.payments p
   where p.paid_on between date_trunc('month', v_today)::date and v_today;

  select jsonb_build_object(
           'to_call', count(*) filter (where q.state = 'due'),
           'broken', count(*) filter (where q.state = 'due' and q.reasons && array['broken_promise', 'partial_promise']))
    into v_calls
    from public.call_list() q;

  with lp as (
    select distinct on (x.parent_id) x.* from public.parent_promises() x order by x.parent_id, x.made_on desc, x.made_at desc
  )
  select jsonb_build_object(
           'promises_today', count(*) filter (where lp.status = 'pending' and lp.promised_date = v_today),
           'promised_today', coalesce(sum(lp.promised_amount) filter (where lp.status = 'pending' and lp.promised_date = v_today), 0))
    into v_prom
    from lp;

  return jsonb_build_object('today', v_today, 'month', to_char(v_today, 'YYYY-MM')) || v_money || v_calls || v_prom;
end $$;

-- ---------------------------------------------------------------------------
-- Home: the first five families of today's call list, in the order of the Calls page
-- ---------------------------------------------------------------------------
create function public.home_chase()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  perform public.assert_staff();
  perform public.assert_sees_school();
  with q as materialized (select * from public.call_list() q where q.state = 'due'),
  r as (
    select q.*, row_number() over (order by q.priority desc, q.total_overdue desc, q.parent_id) as rank from q
  )
  select jsonb_build_object(
           'total', (select count(*) from q),
           'rows', coalesce(jsonb_agg(jsonb_build_object(
                     'parent_id', r.parent_id, 'name', p.name, 'rank', r.rank, 'reason', r.reasons[1],
                     'to_recover', r.total_overdue,
                     'child', r.children -> 0 ->> 'full_name', 'class_name', r.children -> 0 ->> 'class_name',
                     'more_children', greatest(jsonb_array_length(r.children) - 1, 0)
                   ) order by r.rank) filter (where r.rank <= 5), '[]'::jsonb))
    into v_out
    from r
    join public.parents p on p.id = r.parent_id;
  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- Home: each class's share of this year's Total fee received
-- ---------------------------------------------------------------------------
create function public.home_classes(p_session uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  perform public.assert_staff();
  perform public.assert_sees_school();
  if not exists (select 1 from public.academic_sessions where id = p_session) then raise exception 'Unknown session'; end if;
  with sb as materialized (select * from public.student_balances(p_session) b where b.class_id is not null)
  select coalesce(jsonb_agg(jsonb_build_object(
           'class_id', x.class_id, 'class_name', x.class_name, 'students', x.students,
           'total_fee', x.total_fee, 'received', x.received, 'due_now', x.due_now,
           'received_pct', case when x.total_fee > 0 then round(100.0 * x.received / x.total_fee) end
         ) order by x.class_order, x.class_name), '[]'::jsonb)
    into v_out
    from (select sb.class_id, sb.class_name, min(sb.class_order) as class_order, count(*) as students,
                 sum(sb.expected)::bigint as total_fee, sum(sb.received)::bigint as received, sum(sb.overdue)::bigint as due_now
            from sb group by sb.class_id, sb.class_name) x;
  return v_out;
end $$;

revoke execute on all functions in schema public from public;
