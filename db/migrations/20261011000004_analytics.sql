-- =============================================================================
-- Analytics
--
-- Every number on every screen comes from these functions, which all read the
-- same two sources: student_charges (expected) and allocations (received).
-- That is what keeps the parts summing to the totals.
--
-- Vocabulary (for a selected session S):
--   expected      : net charges of S (after concessions)
--   due_expected  : net charges of S whose installment due date has passed
--   received      : allocations to S's charges (whenever the money came in)
--   pending       : expected - received
--   overdue       : due_expected - received against those due charges
--   prev_*        : the same for charges of sessions that started before S
--                   (opening = unpaid on the first day of S)
--   advance       : money not yet matched to any charge
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Per-student balances for a session (the base of most views)
-- -----------------------------------------------------------------------------
create function public.student_balances(p_session uuid, p_as_of date default null)
returns table (
  student_id         uuid,
  admission_no       text,
  full_name          text,
  father_name        text,
  phone              text,
  student_status     public.student_status,
  class_id           uuid,
  class_name         text,
  class_order        integer,
  section            text,
  roll_no            text,
  gross              bigint,
  concession         bigint,
  expected           bigint,
  due_expected       bigint,
  received           bigint,
  due_received       bigint,
  pending            bigint,
  overdue            bigint,
  prev_opening       bigint,
  prev_recovered     bigint,
  prev_pending       bigint,
  total_pending      bigint,
  total_overdue      bigint,
  advance_balance    bigint,
  last_paid_on       date,
  days_since_payment integer,
  paid_pct           numeric,
  fee_status         text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_start date;
  v_today date := coalesce(p_as_of, public.fees_today());
begin
  perform public.assert_staff();
  select s.start_date into v_start from public.academic_sessions s where s.id = p_session;
  if v_start is null then raise exception 'Unknown session'; end if;

  return query
  with ch as (
    select sc.id, sc.student_id, sc.session_id, sc.amount, sc.concession, sc.net_amount, i.due_date, s.start_date
      from public.student_charges sc
      join public.installments i       on i.id = sc.installment_id
      join public.academic_sessions s  on s.id = sc.session_id
     where s.start_date <= v_start
  ),
  al as (
    select a.charge_id,
           sum(a.amount) as amt,
           coalesce(sum(a.amount) filter (where a.paid_on < v_start), 0) as amt_before
      from public.allocations a
     where a.charge_id is not null
       and a.session_id in (select s.id from public.academic_sessions s where s.start_date <= v_start)
     group by a.charge_id
  ),
  ps as (
    select ch.student_id,
           count(*) filter (where ch.session_id = p_session) as n_charges,
           coalesce(sum(ch.amount)      filter (where ch.session_id = p_session), 0)::bigint as gross,
           coalesce(sum(ch.concession)  filter (where ch.session_id = p_session), 0)::bigint as concession,
           coalesce(sum(ch.net_amount)  filter (where ch.session_id = p_session), 0)::bigint as expected,
           coalesce(sum(ch.net_amount)  filter (where ch.session_id = p_session and ch.due_date <= v_today), 0)::bigint as due_expected,
           coalesce(sum(coalesce(al.amt, 0)) filter (where ch.session_id = p_session), 0)::bigint as received,
           coalesce(sum(coalesce(al.amt, 0)) filter (where ch.session_id = p_session and ch.due_date <= v_today), 0)::bigint as due_received,
           coalesce(sum(ch.net_amount - coalesce(al.amt_before, 0)) filter (where ch.start_date < v_start), 0)::bigint as prev_opening,
           coalesce(sum(coalesce(al.amt, 0) - coalesce(al.amt_before, 0)) filter (where ch.start_date < v_start), 0)::bigint as prev_recovered
      from ch
      left join al on al.charge_id = ch.id
     group by ch.student_id
  ),
  adv as (
    select a.student_id, sum(a.amount)::bigint as amt
      from public.allocations a
     where a.charge_id is null
     group by a.student_id
  ),
  lp as (
    select p.student_id, max(p.paid_on) as last_paid
      from public.payments p
     where p.amount > 0
       and not exists (select 1 from public.payments r where r.reverses_payment_id = p.id)
     group by p.student_id
  ),
  enr as (
    select e.student_id, e.class_id, e.section, e.roll_no
      from public.enrollments e
     where e.session_id = p_session
  ),
  base as (
    select coalesce(enr.student_id, ps.student_id) as sid,
           enr.class_id, enr.section, enr.roll_no,
           coalesce(ps.n_charges, 0) as n_charges,
           coalesce(ps.gross, 0) as gross,
           coalesce(ps.concession, 0) as concession,
           coalesce(ps.expected, 0) as expected,
           coalesce(ps.due_expected, 0) as due_expected,
           coalesce(ps.received, 0) as received,
           coalesce(ps.due_received, 0) as due_received,
           coalesce(ps.prev_opening, 0) as prev_opening,
           coalesce(ps.prev_recovered, 0) as prev_recovered
      from enr
      full join ps on ps.student_id = enr.student_id
     where enr.student_id is not null
        or coalesce(ps.expected, 0) <> 0
        or coalesce(ps.received, 0) <> 0
        or coalesce(ps.prev_opening, 0) - coalesce(ps.prev_recovered, 0) <> 0
  )
  select st.id, st.admission_no, st.full_name, st.father_name, st.phone, st.status,
         b.class_id, c.name, c.sort_order, b.section, b.roll_no,
         b.gross, b.concession, b.expected, b.due_expected, b.received, b.due_received,
         b.expected - b.received,
         b.due_expected - b.due_received,
         b.prev_opening, b.prev_recovered,
         b.prev_opening - b.prev_recovered,
         (b.expected - b.received) + (b.prev_opening - b.prev_recovered),
         (b.due_expected - b.due_received) + (b.prev_opening - b.prev_recovered),
         coalesce(adv.amt, 0),
         lp.last_paid,
         (v_today - lp.last_paid)::integer,
         case when b.expected > 0 then round(100.0 * b.received / b.expected, 1) end,
         case
           when b.n_charges = 0 and b.prev_opening - b.prev_recovered = 0 then 'no_plan'
           when b.expected = 0 and b.prev_opening - b.prev_recovered = 0 then 'free'
           when b.due_expected - b.due_received = 0 and b.prev_opening - b.prev_recovered = 0 then 'paid_up'
           when b.due_expected - b.due_received = 0 then 'arrears_only'
           when b.received = 0 then 'not_paying'
           else 'partial'
         end
    from base b
    join public.students st on st.id = b.sid
    left join public.classes c on c.id = b.class_id
    left join adv on adv.student_id = b.sid
    left join lp on lp.student_id = b.sid;
end $$;

-- -----------------------------------------------------------------------------
-- Class summary rows for a session (used by dashboard and classes page)
-- -----------------------------------------------------------------------------
create function public.class_summary(p_session uuid, p_include_arrears boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.assert_staff();
  with sb as materialized (select * from public.student_balances(p_session)),
  rows as (
    select sb.class_id, sb.class_name, sb.class_order,
           count(*) filter (where sb.class_id is not null or sb.expected > 0
                            or (p_include_arrears and sb.prev_pending <> 0)) as students,
           sum(sb.expected + case when p_include_arrears then sb.prev_opening else 0 end) as expected,
           sum(sb.received + case when p_include_arrears then sb.prev_recovered else 0 end) as received,
           sum(sb.pending + case when p_include_arrears then sb.prev_pending else 0 end) as pending,
           sum(sb.due_expected + case when p_include_arrears then sb.prev_opening else 0 end) as due_expected,
           sum(sb.overdue + case when p_include_arrears then sb.prev_pending else 0 end) as overdue,
           sum(sb.prev_pending) as prev_pending,
           sum(sb.concession) as concession,
           count(*) filter (where sb.fee_status = 'paid_up') as paid_up,
           count(*) filter (where sb.fee_status = 'partial') as partial,
           count(*) filter (where sb.fee_status = 'not_paying') as not_paying,
           count(*) filter (where sb.fee_status = 'arrears_only') as arrears_only,
           count(*) filter (where sb.fee_status in ('free', 'no_plan')) as free,
           count(*) filter (where sb.expected > 0 and sb.received >= sb.expected) as band_100,
           count(*) filter (where sb.expected > 0 and sb.received * 2 >= sb.expected and sb.received < sb.expected) as band_50,
           count(*) filter (where sb.expected > 0 and sb.received > 0 and sb.received * 2 < sb.expected) as band_1,
           count(*) filter (where sb.expected > 0 and sb.received <= 0) as band_0
      from sb
     where p_include_arrears or sb.class_id is not null or sb.expected <> 0 or sb.received <> 0
     group by sb.class_id, sb.class_name, sb.class_order
  ),
  tot as (select nullif(sum(pending), 0) as pending from rows)
  select coalesce(jsonb_agg(jsonb_build_object(
           'class_id', r.class_id,
           'class_name', coalesce(r.class_name, 'Not enrolled / left'),
           'students', r.students,
           'expected', coalesce(r.expected, 0),
           'received', coalesce(r.received, 0),
           'pending', coalesce(r.pending, 0),
           'due_expected', coalesce(r.due_expected, 0),
           'overdue', coalesce(r.overdue, 0),
           'prev_pending', coalesce(r.prev_pending, 0),
           'concession', coalesce(r.concession, 0),
           'share_of_pending', case when tot.pending is not null then round(100.0 * r.pending / tot.pending, 1) else 0 end,
           'collection_pct', case when r.expected > 0 then round(100.0 * r.received / r.expected, 1) end,
           'due_collection_pct', case when r.due_expected > 0 then round(100.0 * (r.due_expected - r.overdue) / r.due_expected, 1) end,
           'status', jsonb_build_object('paid_up', r.paid_up, 'partial', r.partial, 'not_paying', r.not_paying,
                                        'arrears_only', r.arrears_only, 'free', r.free),
           'bands', jsonb_build_object('full', r.band_100, 'over_half', r.band_50, 'under_half', r.band_1, 'nothing', r.band_0)
         ) order by r.class_order nulls last, r.class_name), '[]'::jsonb)
    into v
    from rows r cross join tot;
  return v;
end $$;

-- -----------------------------------------------------------------------------
-- Yearly dashboard
-- -----------------------------------------------------------------------------
create function public.dashboard(p_session uuid, p_include_arrears boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sess   public.academic_sessions;
  v_today  date := public.fees_today();
  v_kpis   jsonb;
  v_trend  jsonb;
  v_heads  jsonb;
  v_status jsonb;
  v_cash   jsonb;
  v_modes  jsonb;
begin
  perform public.assert_staff();
  select * into v_sess from public.academic_sessions where id = p_session;
  if not found then raise exception 'Unknown session'; end if;

  with sb as materialized (select * from public.student_balances(p_session))
  select jsonb_build_object(
           'students_enrolled', count(*) filter (where sb.class_id is not null),
           'students_billed', count(*) filter (where sb.expected > 0),
           'gross', coalesce(sum(sb.gross), 0),
           'concession', coalesce(sum(sb.concession), 0),
           'session_expected', coalesce(sum(sb.expected), 0),
           'session_received', coalesce(sum(sb.received), 0),
           'session_pending', coalesce(sum(sb.pending), 0),
           'session_due_expected', coalesce(sum(sb.due_expected), 0),
           'session_due_received', coalesce(sum(sb.due_received), 0),
           'session_overdue', coalesce(sum(sb.overdue), 0),
           'prev_opening', coalesce(sum(sb.prev_opening), 0),
           'prev_recovered', coalesce(sum(sb.prev_recovered), 0),
           'prev_pending', coalesce(sum(sb.prev_pending), 0),
           'advance_held', coalesce(sum(sb.advance_balance), 0),
           'students_with_overdue', count(*) filter (where sb.overdue + case when p_include_arrears then sb.prev_pending else 0 end > 0),
           'students_with_prev_dues', count(*) filter (where sb.prev_pending > 0)
         ),
         jsonb_build_object(
           'paid_up', count(*) filter (where sb.fee_status = 'paid_up'),
           'partial', count(*) filter (where sb.fee_status = 'partial'),
           'not_paying', count(*) filter (where sb.fee_status = 'not_paying'),
           'arrears_only', count(*) filter (where sb.fee_status = 'arrears_only'),
           'free', count(*) filter (where sb.fee_status = 'free'),
           'no_plan', count(*) filter (where sb.fee_status = 'no_plan')
         )
    into v_kpis, v_status
    from sb
   where p_include_arrears or sb.class_id is not null or sb.expected <> 0 or sb.received <> 0;

  -- money that actually came in during the session dates, by what it paid for
  select jsonb_build_object(
           'total', coalesce(sum(a.amount), 0),
           'current', coalesce(sum(a.amount) filter (where a.kind = 'current'), 0),
           'arrears', coalesce(sum(a.amount) filter (where a.kind = 'arrears'), 0),
           'advance', coalesce(sum(a.amount) filter (where a.kind = 'advance'), 0)
         )
    into v_cash
    from public.allocations a
   where a.payment_session_id = p_session;

  -- monthly trend across the session
  with months as (
    select generate_series(date_trunc('month', v_sess.start_date), date_trunc('month', v_sess.end_date), interval '1 month')::date as m
  ),
  exp as (
    select date_trunc('month', i.due_date)::date as m, sum(sc.net_amount) as amt
      from public.student_charges sc
      join public.installments i on i.id = sc.installment_id
     where sc.session_id = p_session
     group by 1
  ),
  rec as (
    select date_trunc('month', a.paid_on)::date as m,
           sum(a.amount) as total,
           sum(a.amount) filter (where a.kind = 'current') as cur,
           sum(a.amount) filter (where a.kind = 'arrears') as arr,
           sum(a.amount) filter (where a.kind = 'advance') as adv
      from public.allocations a
     where a.payment_session_id = p_session
     group by 1
  ),
  t as (
    select months.m,
           coalesce(exp.amt, 0) as expected,
           coalesce(rec.total, 0) as received,
           coalesce(rec.cur, 0) as cur,
           coalesce(rec.arr, 0) as arr,
           coalesce(rec.adv, 0) as adv,
           sum(coalesce(exp.amt, 0)) over (order by months.m) as cum_expected,
           sum(coalesce(rec.cur, 0)) over (order by months.m) as cum_current,
           sum(coalesce(rec.total, 0)) over (order by months.m) as cum_received
      from months
      left join exp on exp.m = months.m
      left join rec on rec.m = months.m
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'month', to_char(t.m, 'YYYY-MM'),
           'label', to_char(t.m, 'Mon YY'),
           'expected', t.expected,
           'received', t.received,
           'current', t.cur,
           'arrears', t.arr,
           'advance', t.adv,
           'cum_expected', t.cum_expected,
           'cum_current', t.cum_current,
           'cum_received', t.cum_received,
           'is_future', t.m > v_today
         ) order by t.m), '[]'::jsonb)
    into v_trend
    from t;

  -- fee-head split for the session (+ previous dues as one row)
  with h as (
    select fh.name, fh.priority,
           sum(sc.net_amount) as expected,
           coalesce(sum(al.amt), 0) as received
      from public.student_charges sc
      join public.fee_heads fh on fh.id = sc.fee_head_id
      left join (select charge_id, sum(amount) amt from public.allocations where session_id = p_session group by charge_id) al
             on al.charge_id = sc.id
     where sc.session_id = p_session
     group by fh.name, fh.priority
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'fee_head', h.name, 'expected', h.expected, 'received', h.received, 'pending', h.expected - h.received
         ) order by h.priority, h.name), '[]'::jsonb)
    into v_heads
    from h;

  if p_include_arrears and coalesce((v_kpis ->> 'prev_pending')::bigint, 0) <> 0 then
    v_heads := v_heads || jsonb_build_array(jsonb_build_object(
      'fee_head', 'Previous sessions',
      'expected', (v_kpis ->> 'prev_opening')::bigint,
      'received', (v_kpis ->> 'prev_recovered')::bigint,
      'pending', (v_kpis ->> 'prev_pending')::bigint));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('mode', x.mode, 'amount', x.amt, 'count', x.cnt) order by x.amt desc), '[]'::jsonb)
    into v_modes
    from (select p.mode, sum(p.amount) amt, count(*) filter (where p.amount > 0) cnt
            from public.payments p where p.session_id = p_session group by p.mode) x;

  return jsonb_build_object(
    'session', jsonb_build_object('id', v_sess.id, 'name', v_sess.name, 'start_date', v_sess.start_date,
                                  'end_date', v_sess.end_date, 'is_current', v_sess.is_current),
    'today', v_today,
    'include_arrears', p_include_arrears,
    'kpis', v_kpis,
    'status', v_status,
    'cash', v_cash,
    'classes', public.class_summary(p_session, p_include_arrears),
    'trend', v_trend,
    'heads', v_heads,
    'modes', v_modes
  );
end $$;

-- -----------------------------------------------------------------------------
-- Monthly analysis
-- Target ("expected this month") = what was still unpaid on the 1st of the month for:
--   * installments of the month's session due in the month
--   * + installments due earlier in the session      (p_carry)
--   * + every charge of earlier sessions             (p_arrears)
-- Received = all money that came in during the month (by payment date).
-- -----------------------------------------------------------------------------
create function public.month_target_charges(p_month date, p_carry boolean, p_arrears boolean)
returns table (charge_id uuid, student_id uuid, net bigint, due_date date, session_id uuid,
               alloc_before bigint, alloc_in bigint, due_in_month boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_ms    date := date_trunc('month', p_month)::date;
  v_me    date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_sess  uuid := coalesce(public.session_for_date(v_ms), public.session_for_date(v_me));
  v_start date;
begin
  select start_date into v_start from public.academic_sessions where id = v_sess;
  return query
  select sc.id, sc.student_id, sc.net_amount, i.due_date, sc.session_id,
         coalesce(sum(a.amount) filter (where a.paid_on < v_ms), 0)::bigint,
         coalesce(sum(a.amount) filter (where a.paid_on between v_ms and v_me), 0)::bigint,
         (sc.session_id = v_sess and i.due_date between v_ms and v_me)
    from public.student_charges sc
    join public.installments i on i.id = sc.installment_id
    join public.academic_sessions s on s.id = sc.session_id
    left join public.allocations a on a.charge_id = sc.id
   where sc.net_amount > 0
     and (
           (sc.session_id = v_sess and (i.due_date between v_ms and v_me or (p_carry and i.due_date < v_ms)))
        or (p_arrears and s.start_date < v_start)
     )
   group by sc.id, sc.student_id, sc.net_amount, i.due_date, sc.session_id;
end $$;

create function public.month_summary(p_month date, p_carry boolean default true, p_arrears boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_ms       date := date_trunc('month', p_month)::date;
  v_me       date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_today    date := public.fees_today();
  v_sess     public.academic_sessions;
  v_days_in  integer;
  v_elapsed  integer;
  v_left     integer;
  v_summary  jsonb;
  v_daily    jsonb;
  v_classes  jsonb;
  v_modes    jsonb;
  v_heads    jsonb;
  v_snap     public.monthly_snapshots;
begin
  perform public.assert_staff();
  select * into v_sess from public.academic_sessions
   where id = coalesce(public.session_for_date(v_ms), public.session_for_date(v_me));
  if not found then raise exception 'No academic session covers %', to_char(v_ms, 'Mon YYYY'); end if;

  v_days_in := v_me - v_ms + 1;
  v_elapsed := greatest(0, least(v_today, v_me) - v_ms + 1);
  v_left    := case when v_today < v_ms then v_days_in when v_today > v_me then 0 else v_me - v_today + 1 end;

  -- money in the month, per student (net of reversals)
  if to_regclass('pg_temp._mm_pay') is null then
    create temp table _mm_pay (student_id uuid primary key, total bigint, cur bigint, arr bigint, adv bigint, n integer) on commit drop;
  else
    truncate _mm_pay;
  end if;
  insert into _mm_pay
  select a.student_id, sum(a.amount), coalesce(sum(a.amount) filter (where a.kind = 'current'), 0),
         coalesce(sum(a.amount) filter (where a.kind = 'arrears'), 0),
         coalesce(sum(a.amount) filter (where a.kind = 'advance'), 0),
         (select count(*) from public.payments p where p.student_id = a.student_id and p.amount > 0 and p.paid_on between v_ms and v_me)
    from public.allocations a
   where a.paid_on between v_ms and v_me
   group by a.student_id;

  if to_regclass('pg_temp._mm_tgt') is null then
    create temp table _mm_tgt (student_id uuid primary key, target bigint, collected bigint, due_gross bigint, prepaid bigint, carry bigint, arrears bigint) on commit drop;
  else
    truncate _mm_tgt;
  end if;
  insert into _mm_tgt
  select t.student_id,
         sum(t.net - t.alloc_before),
         sum(t.alloc_in),
         coalesce(sum(t.net) filter (where t.due_in_month), 0),
         coalesce(sum(t.alloc_before) filter (where t.due_in_month), 0),
         coalesce(sum(t.net - t.alloc_before) filter (where t.session_id = v_sess.id and not t.due_in_month), 0),
         coalesce(sum(t.net - t.alloc_before) filter (where t.session_id <> v_sess.id), 0)
    from public.month_target_charges(v_ms, p_carry, p_arrears) t
   group by t.student_id;

  select jsonb_build_object(
    'due_in_month', coalesce((select sum(due_gross) from _mm_tgt), 0),
    'prepaid', coalesce((select sum(prepaid) from _mm_tgt), 0),
    'carry_over', coalesce((select sum(carry) from _mm_tgt), 0),
    'arrears_outstanding', coalesce((select sum(arrears) from _mm_tgt), 0),
    'expected', coalesce((select sum(target) from _mm_tgt), 0),
    'collected_against_target', coalesce((select sum(collected) from _mm_tgt), 0),
    'still_to_come', coalesce((select sum(target - collected) from _mm_tgt), 0),
    'received', coalesce((select sum(total) from _mm_pay), 0),
    'received_current', coalesce((select sum(cur) from _mm_pay), 0),
    'received_arrears', coalesce((select sum(arr) from _mm_pay), 0),
    'received_advance', coalesce((select sum(adv) from _mm_pay), 0),
    'payments_count', (select count(*) from public.payments p where p.amount > 0 and p.paid_on between v_ms and v_me),
    'reversals', coalesce((select sum(p.amount) from public.payments p where p.amount < 0 and p.paid_on between v_ms and v_me), 0),
    'students_paid', (select count(*) from _mm_pay where total > 0),
    'students_expected', (select count(*) from _mm_tgt where target > 0),
    'students_expected_paid', (select count(*) from _mm_tgt t join _mm_pay p using (student_id) where t.target > 0 and p.total > 0),
    'students_expected_not_paid', (select count(*) from _mm_tgt t left join _mm_pay p using (student_id)
                                    where t.target > 0 and coalesce(p.total, 0) <= 0),
    'students_cleared', (select count(*) from _mm_tgt where target > 0 and target - collected <= 0),
    'days_in_month', v_days_in,
    'days_elapsed', v_elapsed,
    'days_left', v_left
  ) into v_summary;

  v_summary := v_summary || jsonb_build_object(
    'run_rate_needed', case when v_left > 0 then ceil((v_summary ->> 'still_to_come')::numeric / v_left) else null end,
    'collection_pct', case when (v_summary ->> 'expected')::bigint > 0
                           then round(100.0 * (v_summary ->> 'collected_against_target')::bigint / (v_summary ->> 'expected')::bigint, 1) end
  );

  -- daily collection
  with days as (select generate_series(v_ms, v_me, interval '1 day')::date as d),
  pd as (select p.paid_on as d, sum(p.amount) as amt, count(*) filter (where p.amount > 0) as cnt
           from public.payments p where p.paid_on between v_ms and v_me group by p.paid_on)
  , x as (
    select days.d, coalesce(pd.amt, 0) as amt, coalesce(pd.cnt, 0) as cnt,
           sum(coalesce(pd.amt, 0)) over (order by days.d) as cum
      from days left join pd on pd.d = days.d
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', x.d, 'day', extract(day from x.d)::int,
           'amount', x.amt, 'count', x.cnt, 'cumulative', x.cum,
           'is_future', x.d > v_today
         ) order by x.d), '[]'::jsonb)
    into v_daily
    from x;

  -- class contribution (class = enrolment in the month's session)
  with stu as (
    select coalesce(p.student_id, t.student_id) as student_id,
           coalesce(p.total, 0) as total, coalesce(p.cur, 0) as cur, coalesce(p.arr, 0) as arr, coalesce(p.adv, 0) as adv,
           coalesce(t.target, 0) as target, coalesce(t.collected, 0) as collected
      from _mm_pay p full join _mm_tgt t on t.student_id = p.student_id
  ),
  cls as (
    select e.class_id, c.name, c.sort_order,
           sum(stu.total) as received, sum(stu.cur) as cur, sum(stu.arr) as arr, sum(stu.adv) as adv,
           sum(stu.target) as expected, sum(stu.collected) as collected,
           count(*) filter (where stu.total > 0) as students_paid,
           count(*) filter (where stu.target > 0) as students_expected,
           count(*) filter (where stu.target > 0 and stu.total <= 0) as students_not_paid
      from stu
      left join public.enrollments e on e.student_id = stu.student_id and e.session_id = v_sess.id
      left join public.classes c on c.id = e.class_id
     group by e.class_id, c.name, c.sort_order
  ),
  tot as (select nullif(sum(received), 0) as r from cls)
  select coalesce(jsonb_agg(jsonb_build_object(
           'class_id', cls.class_id,
           'class_name', coalesce(cls.name, 'Not enrolled / left'),
           'received', cls.received, 'current', cls.cur, 'arrears', cls.arr, 'advance', cls.adv,
           'share', case when tot.r is not null then round(100.0 * cls.received / tot.r, 1) else 0 end,
           'expected', cls.expected, 'collected', cls.collected, 'still_to_come', cls.expected - cls.collected,
           'collection_pct', case when cls.expected > 0 then round(100.0 * cls.collected / cls.expected, 1) end,
           'students_paid', cls.students_paid, 'students_expected', cls.students_expected,
           'students_not_paid', cls.students_not_paid
         ) order by cls.sort_order nulls last, cls.name), '[]'::jsonb)
    into v_classes
    from cls cross join tot;

  select coalesce(jsonb_agg(jsonb_build_object('mode', x.mode, 'amount', x.amt, 'count', x.cnt) order by x.amt desc), '[]'::jsonb)
    into v_modes
    from (select p.mode, sum(p.amount) amt, count(*) filter (where p.amount > 0) cnt
            from public.payments p where p.paid_on between v_ms and v_me group by p.mode) x;

  select coalesce(jsonb_agg(jsonb_build_object('fee_head', x.name, 'amount', x.amt) order by x.prio nulls last), '[]'::jsonb)
    into v_heads
    from (select coalesce(fh.name, 'Advance (unallocated)') as name, fh.priority as prio, sum(a.amount) amt
            from public.allocations a left join public.fee_heads fh on fh.id = a.fee_head_id
           where a.paid_on between v_ms and v_me group by fh.name, fh.priority) x;

  select * into v_snap from public.monthly_snapshots where month = v_ms;

  return jsonb_build_object(
    'month', to_char(v_ms, 'YYYY-MM'),
    'label', to_char(v_ms, 'FMMonth YYYY'),
    'start', v_ms, 'end', v_me, 'today', v_today,
    'status', case when v_today < v_ms then 'upcoming' when v_today > v_me then 'past' else 'current' end,
    'carry', p_carry, 'arrears', p_arrears,
    'session', jsonb_build_object('id', v_sess.id, 'name', v_sess.name, 'start_date', v_sess.start_date, 'end_date', v_sess.end_date),
    'summary', v_summary,
    'daily', v_daily,
    'classes', v_classes,
    'modes', v_modes,
    'heads', v_heads,
    'closed', case when v_snap.month is null then null
                   else jsonb_build_object('closed_at', v_snap.closed_at,
                                           'snapshot', v_snap.data -> ('c' || p_carry::int || 'a' || p_arrears::int)) end
  );
end $$;

-- Payments received in a month with what each one paid for
create function public.month_payments(p_month date, p_class uuid default null, p_unassigned boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ms   date := date_trunc('month', p_month)::date;
  v_me   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_sess uuid := coalesce(public.session_for_date(v_ms), public.session_for_date(v_me));
  v      jsonb;
begin
  perform public.assert_staff();
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.paid_on desc, x.receipt_no desc), '[]'::jsonb)
    into v
    from (
      select p.id as payment_id, p.receipt_no, p.paid_on, p.amount, p.mode, p.reference_no, p.source,
             p.reverses_payment_id is not null as is_reversal,
             exists (select 1 from public.payments r where r.reverses_payment_id = p.id) as cancelled,
             st.id as student_id, st.full_name, st.admission_no, st.father_name,
             c.id as class_id, c.name as class_name, e.section, e.roll_no,
             (select coalesce(jsonb_agg(jsonb_build_object(
                        'session', s.name, 'installment', i.name, 'installment_no', i.number,
                        'fee_head', fh.name, 'amount', a.amount, 'kind', a.kind, 'is_inferred', a.is_inferred)
                      order by s.start_date nulls last, i.number, fh.priority), '[]'::jsonb)
                from public.allocations a
                left join public.academic_sessions s on s.id = a.session_id
                left join public.installments i on i.id = a.installment_id
                left join public.fee_heads fh on fh.id = a.fee_head_id
               where a.payment_id = p.id) as allocations
        from public.payments p
        join public.students st on st.id = p.student_id
        left join public.enrollments e on e.student_id = p.student_id and e.session_id = v_sess
        left join public.classes c on c.id = e.class_id
       where p.paid_on between v_ms and v_me
         and (p_class is null or e.class_id = p_class)
         and (not p_unassigned or e.class_id is null)
    ) x;
  return v;
end $$;

-- Students expected to pay in the month who have not paid anything in it
create function public.month_non_payers(p_month date, p_carry boolean default true, p_arrears boolean default false,
                                        p_class uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ms   date := date_trunc('month', p_month)::date;
  v_me   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_sess uuid := coalesce(public.session_for_date(v_ms), public.session_for_date(v_me));
  v      jsonb;
begin
  perform public.assert_staff();
  with tgt as (
    select t.student_id, sum(t.net - t.alloc_before) as target
      from public.month_target_charges(v_ms, p_carry, p_arrears) t
     group by t.student_id
    having sum(t.net - t.alloc_before) > 0
  ),
  paid as (
    select a.student_id, sum(a.amount) as amt from public.allocations a
     where a.paid_on between v_ms and v_me group by a.student_id
  ),
  lp as (
    select p.student_id, max(p.paid_on) as last_paid from public.payments p
     where p.amount > 0 and not exists (select 1 from public.payments r where r.reverses_payment_id = p.id)
     group by p.student_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'student_id', st.id, 'full_name', st.full_name, 'admission_no', st.admission_no,
           'father_name', st.father_name, 'phone', st.phone,
           'class_id', c.id, 'class_name', coalesce(c.name, 'Not enrolled / left'), 'section', e.section, 'roll_no', e.roll_no,
           'owed', tgt.target, 'last_paid_on', lp.last_paid
         ) order by tgt.target desc), '[]'::jsonb)
    into v
    from tgt
    join public.students st on st.id = tgt.student_id
    left join paid on paid.student_id = tgt.student_id
    left join lp on lp.student_id = tgt.student_id
    left join public.enrollments e on e.student_id = tgt.student_id and e.session_id = v_sess
    left join public.classes c on c.id = e.class_id
   where coalesce(paid.amt, 0) <= 0
     and (p_class is null or e.class_id = p_class);
  return v;
end $$;

-- One class inside one month: every student, what they paid and what for
create function public.month_class_detail(p_month date, p_class uuid, p_carry boolean default true, p_arrears boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ms    date := date_trunc('month', p_month)::date;
  v_me    date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_sess  public.academic_sessions;
  v_class public.classes;
  v_rows  jsonb;
begin
  perform public.assert_staff();
  select * into v_sess from public.academic_sessions
   where id = coalesce(public.session_for_date(v_ms), public.session_for_date(v_me));
  if not found then raise exception 'No academic session covers this month'; end if;
  select * into v_class from public.classes where id = p_class;

  with stu as (
    select e.student_id, e.section, e.roll_no from public.enrollments e
     where e.session_id = v_sess.id and e.class_id = p_class
  ),
  tgt as (
    select t.student_id, sum(t.net - t.alloc_before) as target, sum(t.alloc_in) as collected
      from public.month_target_charges(v_ms, p_carry, p_arrears) t
     where t.student_id in (select student_id from stu)
     group by t.student_id
  ),
  outst as (   -- every charge of this and earlier sessions
    select sc.student_id,
           sum(sc.net_amount - coalesce(a.before_amt, 0)) as at_start,
           sum(sc.net_amount - coalesce(a.before_amt, 0) - coalesce(a.in_amt, 0)) as after
      from public.student_charges sc
      join public.academic_sessions s on s.id = sc.session_id and s.start_date <= v_sess.start_date
      left join (select charge_id,
                        sum(amount) filter (where paid_on < v_ms) as before_amt,
                        sum(amount) filter (where paid_on between v_ms and v_me) as in_amt
                   from public.allocations group by charge_id) a on a.charge_id = sc.id
     where sc.student_id in (select student_id from stu)
     group by sc.student_id
  ),
  paid as (
    select a.student_id, sum(a.amount) as total,
           coalesce(sum(a.amount) filter (where a.kind = 'current'), 0) as cur,
           coalesce(sum(a.amount) filter (where a.kind = 'arrears'), 0) as arr,
           coalesce(sum(a.amount) filter (where a.kind = 'advance'), 0) as adv
      from public.allocations a
     where a.paid_on between v_ms and v_me and a.student_id in (select student_id from stu)
     group by a.student_id
  ),
  paid_for as (
    select a.student_id,
           jsonb_agg(jsonb_build_object('session', s.name, 'installment', i.name, 'installment_no', i.number,
                                        'fee_head', fh.name, 'amount', x_amt, 'kind', a.kind)
                     order by s.start_date nulls last, i.number, fh.priority) as lines
      from (select student_id, session_id, installment_id, fee_head_id, kind, sum(amount) as x_amt
              from public.allocations
             where paid_on between v_ms and v_me and student_id in (select student_id from stu)
             group by student_id, session_id, installment_id, fee_head_id, kind
            having sum(amount) <> 0) a
      left join public.academic_sessions s on s.id = a.session_id
      left join public.installments i on i.id = a.installment_id
      left join public.fee_heads fh on fh.id = a.fee_head_id
     group by a.student_id
  ),
  receipts as (
    select p.student_id,
           jsonb_agg(jsonb_build_object('payment_id', p.id, 'receipt_no', p.receipt_no, 'paid_on', p.paid_on,
                                        'amount', p.amount, 'mode', p.mode) order by p.paid_on, p.receipt_no) as list
      from public.payments p
     where p.paid_on between v_ms and v_me and p.student_id in (select student_id from stu)
     group by p.student_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'student_id', st.id, 'full_name', st.full_name, 'admission_no', st.admission_no,
           'father_name', st.father_name, 'phone', st.phone, 'section', stu.section, 'roll_no', stu.roll_no,
           'paid', coalesce(paid.total, 0), 'paid_current', coalesce(paid.cur, 0),
           'paid_arrears', coalesce(paid.arr, 0), 'paid_advance', coalesce(paid.adv, 0),
           'paid_for', coalesce(paid_for.lines, '[]'::jsonb),
           'outstanding_start', coalesce(outst.at_start, 0),
           'balance_after', coalesce(outst.after, 0),
           'pct_of_outstanding', case when coalesce(outst.at_start, 0) > 0
                                      then round(100.0 * (outst.at_start - outst.after) / outst.at_start, 1) end,
           'target', coalesce(tgt.target, 0),
           'target_remaining', coalesce(tgt.target, 0) - coalesce(tgt.collected, 0),
           'status', case
                       when coalesce(tgt.target, 0) <= 0 and coalesce(paid.total, 0) <= 0 then 'nothing_due'
                       when coalesce(tgt.target, 0) - coalesce(tgt.collected, 0) <= 0 then 'paid'
                       when coalesce(paid.total, 0) > 0 then 'partial'
                       else 'not_paid'
                     end,
           'receipts', coalesce(receipts.list, '[]'::jsonb)
         ) order by stu.section, nullif(regexp_replace(coalesce(stu.roll_no, ''), '\D', '', 'g'), '')::numeric nulls last, st.full_name),
         '[]'::jsonb)
    into v_rows
    from stu
    join public.students st on st.id = stu.student_id
    left join tgt on tgt.student_id = stu.student_id
    left join outst on outst.student_id = stu.student_id
    left join paid on paid.student_id = stu.student_id
    left join paid_for on paid_for.student_id = stu.student_id
    left join receipts on receipts.student_id = stu.student_id;

  return jsonb_build_object(
    'month', to_char(v_ms, 'YYYY-MM'), 'label', to_char(v_ms, 'FMMonth YYYY'),
    'session', jsonb_build_object('id', v_sess.id, 'name', v_sess.name),
    'class', jsonb_build_object('id', v_class.id, 'name', v_class.name),
    'carry', p_carry, 'arrears', p_arrears,
    'students', v_rows
  );
end $$;

-- -----------------------------------------------------------------------------
-- Installments
-- -----------------------------------------------------------------------------
create function public.installments_overview(p_session uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.fees_today();
  v jsonb;
begin
  perform public.assert_staff();
  with inst as (
    select i.*, lead(i.due_date) over (order by i.number) as next_due
      from public.installments i where i.session_id = p_session
  ),
  per as (
    select sc.installment_id,
           count(distinct sc.student_id) filter (where sc.net_amount > 0) as students,
           sum(sc.amount) as gross, sum(sc.concession) as concession, sum(sc.net_amount) as expected
      from public.student_charges sc where sc.session_id = p_session
     group by sc.installment_id
  ),
  rec as (
    select a.installment_id, sum(a.amount) as received,
           coalesce(sum(a.amount) filter (where a.paid_on <= i.due_date), 0) as on_time,
           coalesce(sum(a.amount) filter (where a.paid_on > i.due_date), 0) as late
      from public.allocations a join public.installments i on i.id = a.installment_id
     where a.session_id = p_session
     group by a.installment_id
  ),
  cleared as (
    select x.installment_id, count(*) filter (where x.paid >= x.net) as cleared
      from (select sc.installment_id, sc.student_id, sum(sc.net_amount) net, coalesce(sum(al.amt), 0) paid
              from public.student_charges sc
              left join (select charge_id, sum(amount) amt from public.allocations where session_id = p_session group by charge_id) al
                     on al.charge_id = sc.id
             where sc.session_id = p_session
             group by sc.installment_id, sc.student_id
            having sum(sc.net_amount) > 0) x
     group by x.installment_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', inst.id, 'number', inst.number, 'name', inst.name, 'due_date', inst.due_date, 'next_due', inst.next_due,
           'students', coalesce(per.students, 0), 'students_cleared', coalesce(cleared.cleared, 0),
           'gross', coalesce(per.gross, 0), 'concession', coalesce(per.concession, 0),
           'expected', coalesce(per.expected, 0), 'received', coalesce(rec.received, 0),
           'on_time', coalesce(rec.on_time, 0), 'late', coalesce(rec.late, 0),
           'gap', coalesce(per.expected, 0) - coalesce(rec.received, 0),
           'collection_pct', case when coalesce(per.expected, 0) > 0 then round(100.0 * coalesce(rec.received, 0) / per.expected, 1) end,
           'status', case when inst.due_date > v_today then 'upcoming'
                          when inst.next_due is not null and inst.next_due <= v_today then 'closed'
                          else 'open' end
         ) order by inst.number), '[]'::jsonb)
    into v
    from inst
    left join per on per.installment_id = inst.id
    left join rec on rec.installment_id = inst.id
    left join cleared on cleared.installment_id = inst.id;
  return v;
end $$;

create function public.installment_detail(p_installment uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_inst     public.installments;
  v_next     date;
  v_today    date := public.fees_today();
  v_students jsonb;
  v_classes  jsonb;
  v_groups   jsonb;
  v_timing   jsonb;
  v_catch    jsonb;
  v_summary  jsonb;
begin
  perform public.assert_staff();
  select * into v_inst from public.installments where id = p_installment;
  if not found then raise exception 'Unknown installment'; end if;
  select min(due_date) into v_next from public.installments
   where session_id = v_inst.session_id and number > v_inst.number;

  if to_regclass('pg_temp._inst_stu') is null then
    create temp table _inst_stu (student_id uuid primary key, class_id uuid, class_name text, class_order int,
    section text, expected bigint, received bigint, on_time bigint, gap bigint) on commit drop;
  else
    truncate _inst_stu;
  end if;
  insert into _inst_stu
  select sc.student_id, e.class_id, c.name, c.sort_order, e.section,
         sum(sc.net_amount),
         coalesce(sum(al.amt), 0),
         coalesce(sum(al.on_time), 0),
         sum(sc.net_amount) - coalesce(sum(al.amt), 0)
    from public.student_charges sc
    left join (select a.charge_id, sum(a.amount) amt, sum(a.amount) filter (where a.paid_on <= v_inst.due_date) on_time
                 from public.allocations a where a.installment_id = p_installment group by a.charge_id) al
           on al.charge_id = sc.id
    left join public.enrollments e on e.student_id = sc.student_id and e.session_id = v_inst.session_id
    left join public.classes c on c.id = e.class_id
   where sc.installment_id = p_installment
   group by sc.student_id, e.class_id, c.name, c.sort_order, e.section
  having sum(sc.net_amount) > 0;

  select jsonb_build_object(
           'students', count(*),
           'expected', coalesce(sum(expected), 0),
           'received', coalesce(sum(received), 0),
           'on_time', coalesce(sum(on_time), 0),
           'late', coalesce(sum(received - on_time), 0),
           'gap', coalesce(sum(gap), 0),
           'collection_pct', case when sum(expected) > 0 then round(100.0 * sum(received) / sum(expected), 1) end,
           'on_time_pct', case when sum(received) > 0 then round(100.0 * sum(on_time) / sum(received), 1) end
         )
    into v_summary from _inst_stu;

  with cls as (
    select class_id, class_name, class_order, count(*) students,
           sum(expected) expected, sum(received) received, sum(gap) gap,
           count(*) filter (where gap > 0) students_unpaid
      from _inst_stu group by class_id, class_name, class_order
  ),
  tot as (select nullif(sum(gap), 0) g from cls)
  select coalesce(jsonb_agg(jsonb_build_object(
           'class_id', cls.class_id, 'class_name', coalesce(cls.class_name, 'Not enrolled / left'),
           'students', cls.students, 'students_unpaid', cls.students_unpaid,
           'expected', cls.expected, 'received', cls.received, 'gap', cls.gap,
           'share_of_gap', case when tot.g is not null then round(100.0 * cls.gap / tot.g, 1) else 0 end,
           'collection_pct', case when cls.expected > 0 then round(100.0 * cls.received / cls.expected, 1) end
         ) order by cls.class_order nulls last, cls.class_name), '[]'::jsonb)
    into v_classes from cls cross join tot;

  with g as (
    select case when received >= expected then 'full'
                when received * 2 >= expected then 'over_half'
                when received > 0 then 'under_half'
                else 'nothing' end as grp,
           count(*) students, sum(expected) expected, sum(received) received, sum(gap) missing
      from _inst_stu group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('group', grp, 'students', students, 'expected', expected,
                                               'received', received, 'missing', missing)
                            order by array_position(array['full','over_half','under_half','nothing'], grp)), '[]'::jsonb)
    into v_groups from g;

  with r as (
    select s.student_id, s.class_name, s.section, s.expected, s.received, s.gap,
           sum(s.gap) over (order by s.gap desc, s.student_id) as cum,
           sum(s.gap) over () as total
      from _inst_stu s where s.gap > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'student_id', st.id, 'full_name', st.full_name, 'admission_no', st.admission_no, 'phone', st.phone,
           'class_name', coalesce(r.class_name, 'Not enrolled / left'), 'section', r.section,
           'expected', r.expected, 'received', r.received, 'gap', r.gap,
           'cumulative', r.cum, 'cumulative_pct', round(100.0 * r.cum / r.total, 1),
           'in_top_half', (r.cum - r.gap) < r.total / 2.0,
           'group', case when r.received * 2 >= r.expected then 'over_half'
                         when r.received > 0 then 'under_half' else 'nothing' end
         ) order by r.gap desc, r.student_id), '[]'::jsonb)
    into v_students
    from r join public.students st on st.id = r.student_id;

  with t as (
    select case when a.paid_on <= v_inst.due_date then 'on_time'
                when a.paid_on - v_inst.due_date <= 15 then 'late_15'
                when a.paid_on - v_inst.due_date <= 30 then 'late_30'
                else 'late_30_plus' end as bucket,
           sum(a.amount) amt, count(distinct a.payment_id) cnt
      from public.allocations a where a.installment_id = p_installment
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket, 'amount', amt, 'payments', cnt)
                            order by array_position(array['on_time','late_15','late_30','late_30_plus'], bucket)), '[]'::jsonb)
    into v_timing from t;

  select jsonb_build_object(
           'next_due', v_next,
           'amount', coalesce(sum(a.amount), 0),
           'payments', count(distinct a.payment_id)
         )
    into v_catch
    from public.allocations a
   where a.installment_id = p_installment and v_next is not null and a.paid_on >= v_next;

  return jsonb_build_object(
    'installment', jsonb_build_object('id', v_inst.id, 'number', v_inst.number, 'name', v_inst.name,
                                      'due_date', v_inst.due_date, 'session_id', v_inst.session_id, 'next_due', v_next),
    'today', v_today,
    'summary', v_summary,
    'classes', v_classes,
    'groups', v_groups,
    'students', v_students,
    'timing', v_timing,
    'catch_up', v_catch
  );
end $$;

-- Target tracker: e.g. 90% of fees due by 31 December
create function public.target_progress(p_target uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_t       public.collection_targets;
  v_exp     bigint;
  v_rec     bigint;
  v_goal    bigint;
  v_gap     bigint;
  v_list    jsonb;
  v_classes jsonb;
begin
  perform public.assert_staff();
  select * into v_t from public.collection_targets where id = p_target;
  if not found then raise exception 'Unknown target'; end if;

  if to_regclass('pg_temp._tgt_stu') is null then
    create temp table _tgt_stu (student_id uuid primary key, expected bigint, received bigint, remaining bigint) on commit drop;
  else
    truncate _tgt_stu;
  end if;
  insert into _tgt_stu
  select sc.student_id, sum(sc.net_amount), coalesce(sum(al.amt), 0), sum(sc.net_amount) - coalesce(sum(al.amt), 0)
    from public.student_charges sc
    join public.installments i on i.id = sc.installment_id
    left join (select charge_id, sum(amount) amt from public.allocations where session_id = v_t.session_id group by charge_id) al
           on al.charge_id = sc.id
   where sc.session_id = v_t.session_id and i.due_date <= v_t.target_date and sc.net_amount > 0
   group by sc.student_id;

  select coalesce(sum(expected), 0), coalesce(sum(received), 0) into v_exp, v_rec from _tgt_stu;
  v_goal := ceil(v_exp * v_t.target_pct / 100.0);
  v_gap  := greatest(v_goal - v_rec, 0);

  with r as (
    select s.*, sum(s.remaining) over (order by s.remaining desc, s.student_id) as cum
      from _tgt_stu s where s.remaining > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'student_id', st.id, 'full_name', st.full_name, 'admission_no', st.admission_no, 'phone', st.phone,
           'class_name', coalesce(c.name, 'Not enrolled / left'), 'section', e.section,
           'remaining', r.remaining, 'cumulative', r.cum
         ) order by r.remaining desc, r.student_id), '[]'::jsonb)
    into v_list
    from r
    join public.students st on st.id = r.student_id
    left join public.enrollments e on e.student_id = r.student_id and e.session_id = v_t.session_id
    left join public.classes c on c.id = e.class_id
   where v_gap > 0 and r.cum - r.remaining < v_gap;

  select coalesce(jsonb_agg(jsonb_build_object('class_name', x.name, 'remaining', x.rem, 'students', x.n)
                            order by x.ord nulls last), '[]'::jsonb)
    into v_classes
    from (select coalesce(c.name, 'Not enrolled / left') name, c.sort_order ord, sum(s.remaining) rem,
                 count(*) filter (where s.remaining > 0) n
            from _tgt_stu s
            left join public.enrollments e on e.student_id = s.student_id and e.session_id = v_t.session_id
            left join public.classes c on c.id = e.class_id
           group by c.name, c.sort_order having sum(s.remaining) > 0) x;

  return jsonb_build_object(
    'target', to_jsonb(v_t),
    'expected', v_exp, 'received', v_rec, 'goal', v_goal, 'gap', v_gap,
    'current_pct', case when v_exp > 0 then round(100.0 * v_rec / v_exp, 1) end,
    'students_to_close', v_list,
    'classes', v_classes
  );
end $$;

-- -----------------------------------------------------------------------------
-- Class view
-- -----------------------------------------------------------------------------
create function public.class_detail(p_session uuid, p_class uuid, p_include_arrears boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sess    public.academic_sessions;
  v_class   public.classes;
  v_today   date := public.fees_today();
  v_kpis    jsonb;
  v_months  jsonb;
  v_inst    jsonb;
  v_sections jsonb;
begin
  perform public.assert_staff();
  select * into v_sess from public.academic_sessions where id = p_session;
  select * into v_class from public.classes where id = p_class;
  if v_sess.id is null or v_class.id is null then raise exception 'Unknown session or class'; end if;

  with sb as (select * from public.student_balances(p_session) b where b.class_id = p_class)
  select jsonb_build_object(
           'students', count(*),
           'expected', coalesce(sum(sb.expected + case when p_include_arrears then sb.prev_opening else 0 end), 0),
           'received', coalesce(sum(sb.received + case when p_include_arrears then sb.prev_recovered else 0 end), 0),
           'pending', coalesce(sum(sb.pending + case when p_include_arrears then sb.prev_pending else 0 end), 0),
           'due_expected', coalesce(sum(sb.due_expected + case when p_include_arrears then sb.prev_opening else 0 end), 0),
           'overdue', coalesce(sum(sb.overdue + case when p_include_arrears then sb.prev_pending else 0 end), 0),
           'concession', coalesce(sum(sb.concession), 0),
           'prev_pending', coalesce(sum(sb.prev_pending), 0),
           'status', jsonb_build_object(
              'paid_up', count(*) filter (where sb.fee_status = 'paid_up'),
              'partial', count(*) filter (where sb.fee_status = 'partial'),
              'not_paying', count(*) filter (where sb.fee_status = 'not_paying'),
              'arrears_only', count(*) filter (where sb.fee_status = 'arrears_only'),
              'free', count(*) filter (where sb.fee_status in ('free', 'no_plan'))),
           'bands', jsonb_build_object(
              'full', count(*) filter (where sb.expected > 0 and sb.received >= sb.expected),
              'over_half', count(*) filter (where sb.expected > 0 and sb.received * 2 >= sb.expected and sb.received < sb.expected),
              'under_half', count(*) filter (where sb.expected > 0 and sb.received > 0 and sb.received * 2 < sb.expected),
              'nothing', count(*) filter (where sb.expected > 0 and sb.received <= 0))
         )
    into v_kpis from sb;

  select coalesce(jsonb_agg(jsonb_build_object('section', x.section, 'students', x.n) order by x.section), '[]'::jsonb)
    into v_sections
    from (select e.section, count(*) n from public.enrollments e
           where e.session_id = p_session and e.class_id = p_class group by e.section) x;

  with stu as (select e.student_id from public.enrollments e where e.session_id = p_session and e.class_id = p_class),
  months as (
    select generate_series(date_trunc('month', v_sess.start_date), date_trunc('month', v_sess.end_date), interval '1 month')::date as m
  ),
  exp as (
    select date_trunc('month', i.due_date)::date m, sum(sc.net_amount) amt
      from public.student_charges sc join public.installments i on i.id = sc.installment_id
     where sc.session_id = p_session and sc.student_id in (select student_id from stu)
     group by 1
  ),
  rec as (
    select date_trunc('month', a.paid_on)::date m, sum(a.amount) total,
           sum(a.amount) filter (where a.kind = 'current') cur,
           sum(a.amount) filter (where a.kind = 'arrears') arr
      from public.allocations a
     where a.payment_session_id = p_session and a.student_id in (select student_id from stu)
     group by 1
  ),
  payers as (
    select date_trunc('month', p.paid_on)::date m, count(distinct p.student_id) n
      from public.payments p
     where p.amount > 0 and p.session_id = p_session and p.student_id in (select student_id from stu)
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'month', to_char(months.m, 'YYYY-MM'), 'label', to_char(months.m, 'Mon YY'),
           'expected', coalesce(exp.amt, 0), 'received', coalesce(rec.total, 0),
           'current', coalesce(rec.cur, 0), 'arrears', coalesce(rec.arr, 0),
           'payers', coalesce(payers.n, 0), 'is_future', months.m > v_today
         ) order by months.m), '[]'::jsonb)
    into v_months
    from months left join exp on exp.m = months.m left join rec on rec.m = months.m left join payers on payers.m = months.m;

  with stu as (select e.student_id from public.enrollments e where e.session_id = p_session and e.class_id = p_class)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'number', i.number, 'name', i.name, 'due_date', i.due_date,
           'expected', coalesce(x.expected, 0), 'received', coalesce(x.received, 0),
           'gap', coalesce(x.expected, 0) - coalesce(x.received, 0),
           'collection_pct', case when coalesce(x.expected, 0) > 0 then round(100.0 * x.received / x.expected, 1) end
         ) order by i.number), '[]'::jsonb)
    into v_inst
    from public.installments i
    left join (
      select sc.installment_id, sum(sc.net_amount) expected, coalesce(sum(al.amt), 0) received
        from public.student_charges sc
        left join (select charge_id, sum(amount) amt from public.allocations where session_id = p_session group by charge_id) al
               on al.charge_id = sc.id
       where sc.session_id = p_session and sc.student_id in (select student_id from stu)
       group by sc.installment_id
    ) x on x.installment_id = i.id
   where i.session_id = p_session;

  return jsonb_build_object(
    'session', jsonb_build_object('id', v_sess.id, 'name', v_sess.name),
    'class', jsonb_build_object('id', v_class.id, 'name', v_class.name),
    'include_arrears', p_include_arrears,
    'kpis', v_kpis,
    'sections', v_sections,
    'months', v_months,
    'installments', v_inst
  );
end $$;

-- -----------------------------------------------------------------------------
-- Open dues of one student (collect-fee screen), in default allocation order
-- -----------------------------------------------------------------------------
create function public.student_dues(p_student uuid)
returns table (
  charge_id       uuid,
  session_id      uuid,
  session_name    text,
  session_start   date,
  installment_id  uuid,
  installment_no  integer,
  installment_name text,
  due_date        date,
  fee_head_id     uuid,
  fee_head        text,
  fee_head_priority integer,
  amount          bigint,
  concession      bigint,
  net_amount      bigint,
  paid            bigint,
  remaining       bigint,
  is_overdue      boolean
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public.assert_staff();
  return query
  select sc.id, s.id, s.name, s.start_date, i.id, i.number, i.name, i.due_date, fh.id, fh.name, fh.priority,
         sc.amount, sc.concession, sc.net_amount,
         coalesce(al.amt, 0)::bigint, (sc.net_amount - coalesce(al.amt, 0))::bigint,
         i.due_date <= public.fees_today()
    from public.student_charges sc
    join public.installments i on i.id = sc.installment_id
    join public.academic_sessions s on s.id = sc.session_id
    join public.fee_heads fh on fh.id = sc.fee_head_id
    left join (select a.charge_id, sum(a.amount) amt from public.allocations a
                where a.student_id = p_student and a.charge_id is not null group by a.charge_id) al
           on al.charge_id = sc.id
   where sc.student_id = p_student
   order by s.start_date, i.number, fh.priority, fh.name, sc.id;
end $$;

-- -----------------------------------------------------------------------------
-- Student 360
-- -----------------------------------------------------------------------------
create function public.student_360(p_student uuid)
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

-- -----------------------------------------------------------------------------
-- Consistency checks (shown on the admin reconciliation page)
-- -----------------------------------------------------------------------------
create function public.reconciliation(p_session uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_sess     public.academic_sessions;
  v_checks   jsonb := '[]';
  a bigint; b bigint; c bigint;
begin
  perform public.assert_staff();
  select * into v_sess from public.academic_sessions where id = p_session;
  if not found then raise exception 'Unknown session'; end if;

  -- 1. class pending adds up to school pending (incl. previous dues)
  select coalesce(sum((x ->> 'pending')::bigint), 0) into a
    from jsonb_array_elements(public.class_summary(p_session, true)) x;
  select coalesce(sum(sc.net_amount), 0) - coalesce((select sum(al.amount) from public.allocations al
                                                     join public.academic_sessions s2 on s2.id = al.session_id
                                                    where s2.start_date <= v_sess.start_date), 0)
    into b
    from public.student_charges sc join public.academic_sessions s on s.id = sc.session_id
   where s.start_date <= v_sess.start_date;
  v_checks := v_checks || jsonb_build_object('key', 'class_vs_school_pending',
    'label', 'Sum of class pending = school pending (incl. previous dues)', 'left', a, 'right', b, 'ok', a = b);

  -- 2. month received across the session = money received in the session
  select coalesce(sum(p.amount), 0) into a from public.payments p
   where p.paid_on between v_sess.start_date and v_sess.end_date;
  select coalesce(sum(x.amt), 0) into b from (
    select date_trunc('month', p.paid_on) m, sum(p.amount) amt from public.payments p
     where p.paid_on between v_sess.start_date and v_sess.end_date group by 1) x;
  v_checks := v_checks || jsonb_build_object('key', 'months_vs_session_received',
    'label', 'Sum of monthly received = session received', 'left', b, 'right', a, 'ok', a = b);

  -- 3. installment received + previous dues + advance = total received in the session
  select coalesce(sum(al.amount), 0) into a from public.allocations al where al.payment_session_id = p_session and al.kind = 'current';
  select coalesce(sum(al.amount), 0) into b from public.allocations al where al.payment_session_id = p_session and al.kind <> 'current';
  select coalesce(sum(p.amount), 0) into c from public.payments p where p.session_id = p_session;
  v_checks := v_checks || jsonb_build_object('key', 'installments_plus_advance',
    'label', 'Installment received + previous dues + advance = total received', 'left', a + b, 'right', c, 'ok', a + b = c);

  -- 4. every payment fully allocated
  select count(*) into a from public.payments p
   where p.amount <> coalesce((select sum(al.amount) from public.allocations al where al.payment_id = p.id), 0);
  v_checks := v_checks || jsonb_build_object('key', 'payments_fully_allocated',
    'label', 'Payments not fully allocated', 'left', a, 'right', 0, 'ok', a = 0, 'count', true);

  -- 5. no charge over-collected
  select count(*) into a from public.student_charges sc
   where sc.net_amount < coalesce((select sum(al.amount) from public.allocations al where al.charge_id = sc.id), 0);
  v_checks := v_checks || jsonb_build_object('key', 'charges_over_allocated',
    'label', 'Charges with more money allocated than due', 'left', a, 'right', 0, 'ok', a = 0, 'count', true);

  -- 6. enrolled active students without a fee plan
  select count(*) into a from public.enrollments e join public.students st on st.id = e.student_id and st.status = 'active'
   where e.session_id = p_session
     and not exists (select 1 from public.student_charges sc where sc.student_id = e.student_id and sc.session_id = p_session);
  v_checks := v_checks || jsonb_build_object('key', 'enrolled_without_plan',
    'label', 'Enrolled active students with no fee plan for the session', 'left', a, 'right', 0, 'ok', a = 0,
    'count', true, 'warning', true);

  -- 7. charges for students not enrolled in that session
  select count(distinct sc.student_id) into a from public.student_charges sc
   where sc.session_id = p_session and sc.source <> 'opening'
     and not exists (select 1 from public.enrollments e where e.student_id = sc.student_id and e.session_id = p_session);
  v_checks := v_checks || jsonb_build_object('key', 'charges_without_enrolment',
    'label', 'Students charged in the session without an enrolment', 'left', a, 'right', 0, 'ok', a = 0,
    'count', true, 'warning', true);

  -- 8. inferred allocations (informational)
  select count(*), coalesce(sum(amount), 0) into a, b from public.allocations where payment_session_id = p_session and is_inferred;
  v_checks := v_checks || jsonb_build_object('key', 'inferred_allocations',
    'label', 'Allocations inferred by the default rule (imported receipts without a fee head)', 'left', b, 'right', null,
    'ok', true, 'info', true, 'rows', a);

  return jsonb_build_object('session', jsonb_build_object('id', v_sess.id, 'name', v_sess.name),
                            'checked_at', now(), 'checks', v_checks);
end $$;

-- -----------------------------------------------------------------------------
-- Month close / reopen
-- -----------------------------------------------------------------------------
create function public.close_month(p_month date) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ms   date := date_trunc('month', p_month)::date;
  v_me   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_sess uuid;
  v_data jsonb := '{}';
  c boolean; a boolean;
begin
  perform public.assert_admin();
  if v_me >= public.fees_today() then raise exception 'Only months that have ended can be closed'; end if;
  v_sess := coalesce(public.session_for_date(v_ms), public.session_for_date(v_me));
  if v_sess is null then raise exception 'No session covers this month'; end if;

  foreach c in array array[false, true] loop
    foreach a in array array[false, true] loop
      v_data := v_data || jsonb_build_object('c' || c::int || 'a' || a::int,
        (select jsonb_build_object('summary', m -> 'summary', 'classes', m -> 'classes', 'modes', m -> 'modes')
           from public.month_summary(v_ms, c, a) m));
    end loop;
  end loop;

  insert into public.monthly_snapshots (month, session_id, data) values (v_ms, v_sess, v_data)
  on conflict (month) do update set data = excluded.data, closed_at = now(), closed_by = public.current_user_id();
  perform public.audit('close_month', 'monthly_snapshots', to_char(v_ms, 'YYYY-MM'), null);
end $$;

create function public.reopen_month(p_month date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  delete from public.monthly_snapshots where month = date_trunc('month', p_month)::date;
  perform public.audit('reopen_month', 'monthly_snapshots', to_char(p_month, 'YYYY-MM'), null);
end $$;

-- =============================================================================
-- Function privileges: only the owner, and an app role granted access with
-- public.grant_app_access(), may call these
-- =============================================================================
revoke execute on all functions in schema public from public;
