-- =============================================================================
-- Dashboards and assigning families to callers
--
--   * call_assignments remember who gave a family to a caller (assigned_by) and why (note). Admin, accountant
--     and principal may give any family to any caller for today or a later day (assign_call), even a family the
--     day's rules leave off the list; the caller sees it on their list that day. A family given to someone for
--     the day and not called yet is always "to call" for them, with the reason "assigned" when someone else
--     gave it.
--   * recovery_summary(from, to): the money received in a period and what brought it in (a call, an activity,
--     the family on its own), the calls made, and the activities. Used by Home and the recovery dashboard.
--   * call_analytics(from, to): calls per day, outcomes, promises, every caller's effort and result, and
--     whether talking to families makes a difference. Used by the Calls page (staff who see the school).
--   * home_fees() also counts the school: students, families, classes and students by status.
--   * recovery_dashboard() and home_chase() are replaced by the above.
-- =============================================================================

alter table public.call_assignments
  add column assigned_by uuid references public.app_users (id) on delete set null default public.current_user_id(),
  add column note text check (note is null or length(note) <= 300);
update public.call_assignments set assigned_by = assigned_to where assigned_by is null;

-- ---------------------------------------------------------------------------
-- The day's call list, as in 20261023000009_daily_calls.sql, and:
--   state     due also: given to a caller for today (by themselves or by someone else) and not called yet
--   reasons   assigned : someone else (admin, accountant, principal) gave the family to the caller; comes first
-- ---------------------------------------------------------------------------
drop function public.call_list();
create function public.call_list()
returns table (
  parent_id          uuid,
  state              text,
  priority           integer,
  reasons            text[],
  next_call_on       date,
  total_overdue      bigint,
  prev_pending       bigint,
  last_paid_on       date,
  last_paid_amount   bigint,
  days_since_payment integer,
  children           jsonb,
  last_call_on       date,
  last_outcome       text,
  last_response      text,
  last_summary       text,
  last_caller        uuid,
  unanswered         integer,
  follow_up_on       date,
  promise_date       date,
  promise_amount     bigint,
  promise_status     text,
  promise_deadline   date,
  promise_paid       bigint,
  assigned_to        uuid,
  assigned_by        uuid,
  assign_note        text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_today date := public.fees_today();
  v_sess  uuid := public.running_session();
  v_set   public.school_settings;
begin
  perform public.assert_staff();
  if v_sess is null then return; end if;
  select * into v_set from public.school_settings where id = 1;

  return query
  with sb as materialized (
    select b.student_id, b.full_name, b.class_name, b.class_order, b.section, b.total_overdue, b.prev_pending
      from public.student_balances(v_sess) b
  ),
  fam as (
    select st.parent_id as pid,
           sum(sb.total_overdue)::bigint as tod,
           sum(sb.prev_pending)::bigint as pp,
           jsonb_agg(jsonb_build_object('student_id', sb.student_id, 'full_name', sb.full_name, 'class_name', sb.class_name,
                                        'section', sb.section, 'total_overdue', sb.total_overdue)
                     order by sb.class_order nulls last, sb.full_name) as kids
      from sb
      join public.students st on st.id = sb.student_id
     where st.parent_id is not null
     group by st.parent_id
  ),
  lp as (     -- the family's last payment day and what it paid that day
    select x.pid, x.last_paid, sum(x.amount) filter (where x.paid_on = x.last_paid)::bigint as amt
      from (select st.parent_id as pid, p.paid_on, p.amount, max(p.paid_on) over (partition by st.parent_id) as last_paid
              from public.payments p
              join public.students st on st.id = p.student_id
             where st.parent_id is not null and p.amount > 0
               and not exists (select 1 from public.payments r where r.reverses_payment_id = p.id)) x
     group by x.pid, x.last_paid
  ),
  pr as (     -- the latest promise
    select distinct on (x.parent_id) x.parent_id as pid, x.promised_date, x.promised_amount, x.status, x.deadline, x.paid
      from public.parent_promises() x
     order by x.parent_id, x.made_on desc, x.made_at desc
  ),
  conn as (   -- the last fee call that got through
    select distinct on (c.parent_id) c.parent_id as pid, c.call_date, c.called_at
      from public.parent_calls c
     where c.purpose = 'fees' and c.outcome = 'connected'
     order by c.parent_id, c.call_date desc, c.called_at desc
  ),
  lc as (     -- the last fee call, and how many fee calls in a row did not get through
    select y.* from (
      select c.parent_id as pid, c.call_date, c.outcome, c.response, c.summary, c.follow_up_on, c.created_by,
             (count(*) filter (where c.outcome <> 'connected'
                                 and (conn.pid is null or (c.call_date, c.called_at) > (conn.call_date, conn.called_at)))
                over (partition by c.parent_id))::integer as n_missed,
             row_number() over (partition by c.parent_id order by c.call_date desc, c.called_at desc, c.id) as rn
        from public.parent_calls c
        left join conn on conn.pid = c.parent_id
       where c.purpose = 'fees'
    ) y
     where y.rn = 1
  ),
  asg as (
    select a.parent_id as pid, a.assigned_to, a.assigned_by, a.note from public.call_assignments a where a.call_date = v_today
  ),
  b as (
    select pa.id as pid, pa.economic_status, pa.payment_behaviour,
           coalesce(f.tod, 0)::bigint as tod, coalesce(f.pp, 0)::bigint as pp, coalesce(f.kids, '[]'::jsonb) as kids,
           lp.last_paid, lp.amt as last_amt,
           pr.promised_date as p_date, pr.promised_amount as p_amount, pr.status as p_status, pr.deadline as p_deadline,
           pr.paid as p_paid,
           lc.call_date as lc_on, lc.outcome as lc_outcome, lc.response as lc_response, lc.summary as lc_summary,
           lc.follow_up_on as lc_follow, lc.created_by as lc_by, coalesce(lc.n_missed, 0) as n_missed,
           asg.assigned_to as asg_to, asg.assigned_by as asg_by, asg.note as asg_note,
           coalesce(asg.assigned_by <> asg.assigned_to, false) as r_assigned,
           coalesce(f.tod, 0) >= v_set.call_min_overdue as owes,
           coalesce(pr.status in ('broken', 'partial')
                    and coalesce(conn.call_date, '-infinity'::date) <= pr.deadline
                    and coalesce(lp.last_paid, '-infinity'::date) <= pr.deadline, false) as r_broken,
           coalesce(lc.follow_up_on <= v_today, false) as r_callback
      from public.parents pa
      left join fam f on f.pid = pa.id
      left join lp on lp.pid = pa.id
      left join pr on pr.pid = pa.id
      left join conn on conn.pid = pa.id
      left join lc on lc.pid = pa.id
      left join asg on asg.pid = pa.id
     where coalesce(f.tod, 0) >= v_set.call_min_overdue or lc.call_date = v_today or asg.pid is not null
  ),
  s as (
    select b.*,
           -- the earliest day the last fee call allows the next one
           case when b.lc_on is null then v_today
                when b.r_broken and b.lc_on <= b.p_deadline then v_today
                when b.lc_follow is not null then b.lc_follow
                when b.lc_outcome = 'connected' then b.lc_on + v_set.call_gap_days
                else b.lc_on + 1 end as next_by_call,
           (b.last_paid is not null and b.last_paid > v_today - v_set.call_skip_paid_days) as paid_recently
      from b
  ),
  t as (
    select s.*,
           case
             when s.lc_on = v_today then 'called'
             when s.asg_to is not null then 'due'
             when not s.owes then 'cleared'
             when s.p_status = 'pending' then 'promised'
             when s.next_by_call > v_today then 'waiting'
             when s.r_broken or s.r_callback then 'due'
             when s.paid_recently then 'paid_recently'
             else 'due'
           end as st,
           (s.tod >= v_set.call_high_due) as r_high,
           (s.last_paid is null) as r_never,
           (s.last_paid is not null and v_today - s.last_paid >= 60) as r_silent,
           (s.pp > 0) as r_old
      from s
  )
  select t.pid, t.st,
         (case when t.r_broken then case when t.p_status = 'partial' then 35 else 40 end
               when t.r_callback then 30 else 0 end
          + case when t.r_assigned then 45 else 0 end
          + least(30, round(30.0 * t.tod / v_set.call_high_due))
          + case when t.last_paid is null then 15 else least(15, (v_today - t.last_paid) / 6) end
          + case when t.r_old then 5 else 0 end
          + case t.economic_status when 'high' then 6 when 'upper_middle' then 5 when 'middle' then 4
                                   when 'lower_middle' then 2 when 'low' then 1 else 3 end
          + case t.payment_behaviour
              when 'capable_not_paying' then 10 when 'irregular' then 8 when 'installment_wise' then 6 when 'regular' then 6
              when 'year_end' then case when extract(month from v_today) in (1, 2, 3) then 8 else 3 end
              when 'carries_forward' then 4 when 'willing_struggling' then 2 when 'non_payer' then 1 else 5 end
          - least(9, 3 * t.n_missed)
         )::integer,
         array_remove(array[
           case when t.r_assigned then 'assigned' end,
           case when t.r_broken then case when t.p_status = 'partial' then 'partial_promise' else 'broken_promise' end end,
           case when t.r_callback then 'call_back' end,
           case when t.r_high then 'high_dues' end,
           case when t.r_never then 'never_paid' when t.r_silent then 'silent' end,
           case when t.r_old then 'old_dues' end,
           case when t.owes and not (t.r_high or t.r_never or t.r_silent or t.r_old) then 'overdue' end,
           case when t.n_missed > 0 then 'not_reached' end], null),
         case
           when t.st = 'due' then v_today
           when t.st = 'cleared' then null
           when t.p_status = 'pending' then t.p_deadline + 1
           when t.r_broken or t.r_callback then t.next_by_call
           else greatest(t.next_by_call, case when t.paid_recently then t.last_paid + v_set.call_skip_paid_days end)
         end,
         t.tod, t.pp, t.last_paid, t.last_amt, (v_today - t.last_paid)::integer, t.kids,
         t.lc_on, t.lc_outcome, t.lc_response, t.lc_summary, t.lc_by, t.n_missed, t.lc_follow,
         t.p_date, t.p_amount, t.p_status, t.p_deadline, t.p_paid,
         t.asg_to, t.asg_by, t.asg_note
    from t
   where t.st <> 'cleared' or t.asg_to is not null;
end $$;

-- The calling page, as before, with who gave each family to its caller and why
create or replace function public.call_board()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.fees_today();
  v_me    uuid := public.current_user_id();
  v_set   public.school_settings;
  v_list  jsonb;
  v_calls jsonb;
  v_mine  jsonb;
begin
  perform public.assert_staff();
  select * into v_set from public.school_settings where id = 1;

  with q as materialized (select * from public.call_list()),
  ranked as (
    select q.*,
           case when q.state = 'due' then row_number() over (partition by q.state = 'due'
                                                              order by q.priority desc, q.total_overdue desc, q.parent_id) end as rank
      from q
  ),
  tc as (     -- the latest fee call of today per family
    select distinct on (c.parent_id) c.parent_id as pid, c.id, c.outcome, c.response, c.promised_date, c.promised_amount,
           c.follow_up_on, c.called_at, c.created_by
      from public.parent_calls c
     where c.call_date = v_today and c.purpose = 'fees'
     order by c.parent_id, c.called_at desc
  ),
  who as (    -- everybody who called or took families today
    select c.created_by as uid from public.parent_calls c where c.call_date = v_today and c.created_by is not null
    union
    select a.assigned_to from public.call_assignments a where a.call_date = v_today
  )
  select jsonb_build_object(
    -- families to call today, called today, or taken by someone today (highest priority first)
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
               'parent_id', r.parent_id, 'name', p.name, 'phone', p.phone, 'alt_phone', p.alt_phone, 'relation', p.relation,
               'best_time_to_call', p.best_time_to_call, 'economic_status', p.economic_status,
               'payment_behaviour', p.payment_behaviour,
               'state', r.state, 'rank', r.rank, 'priority', r.priority, 'reasons', to_jsonb(r.reasons),
               'next_call_on', r.next_call_on,
               'total_overdue', r.total_overdue, 'prev_pending', r.prev_pending, 'last_paid_on', r.last_paid_on,
               'last_paid_amount', r.last_paid_amount, 'days_since_payment', r.days_since_payment, 'children', r.children,
               'last_call_on', r.last_call_on, 'last_outcome', r.last_outcome, 'last_response', r.last_response,
               'last_summary', r.last_summary, 'last_caller_name', coalesce(nullif(lcp.full_name, ''), lcp.email),
               'unanswered', r.unanswered,
               'promise_date', r.promise_date, 'promise_amount', r.promise_amount, 'promise_status', r.promise_status,
               'promise_deadline', r.promise_deadline, 'promise_paid', r.promise_paid,
               'assigned_to', r.assigned_to, 'assigned_name', coalesce(nullif(ap.full_name, ''), ap.email),
               'assigned_by', r.assigned_by, 'assigned_by_name', coalesce(nullif(gb.full_name, ''), gb.email),
               'assign_note', r.assign_note,
               'today_call', case when tc.id is null then null else jsonb_build_object(
                                'id', tc.id, 'outcome', tc.outcome, 'response', tc.response, 'promised_date', tc.promised_date,
                                'promised_amount', tc.promised_amount, 'follow_up_on', tc.follow_up_on, 'called_at', tc.called_at,
                                'caller_id', tc.created_by, 'caller_name', coalesce(nullif(tp.full_name, ''), tp.email)) end
             ) order by (r.state = 'due') desc, r.rank, tc.called_at desc nulls last, r.total_overdue desc, p.name), '[]'::jsonb)
               from ranked r
               join public.parents p on p.id = r.parent_id
               left join public.profiles lcp on lcp.id = r.last_caller
               left join public.profiles ap on ap.id = r.assigned_to
               left join public.profiles gb on gb.id = r.assigned_by
               left join tc on tc.pid = r.parent_id
               left join public.profiles tp on tp.id = tc.created_by
              where r.state in ('due', 'called') or r.assigned_to is not null),
    'counts', (select jsonb_build_object(
                 'due', count(*) filter (where q.state = 'due'),
                 'due_open', count(*) filter (where q.state = 'due' and q.assigned_to is null),
                 'due_overdue', coalesce(sum(q.total_overdue) filter (where q.state = 'due'), 0),
                 'called', count(*) filter (where q.state = 'called'),
                 'promised', count(*) filter (where q.state = 'promised'),
                 'promised_amount', coalesce(sum(q.promise_amount) filter (where q.state = 'promised'), 0),
                 'paid_recently', count(*) filter (where q.state = 'paid_recently'),
                 'waiting', count(*) filter (where q.state = 'waiting'),
                 'broken', count(*) filter (where q.state = 'due' and q.reasons && array['broken_promise', 'partial_promise']),
                 'call_back', count(*) filter (where q.state = 'due' and 'call_back' = any (q.reasons)))
                 from q),
    -- promises falling due in the next three days (unpaid, the family comes back on the list)
    'promises_due', (select coalesce(jsonb_agg(jsonb_build_object(
                       'parent_id', q.parent_id, 'name', p.name, 'phone', p.phone, 'promise_date', q.promise_date,
                       'promise_amount', q.promise_amount, 'promise_deadline', q.promise_deadline, 'promise_paid', q.promise_paid,
                       'total_overdue', q.total_overdue
                     ) order by q.promise_date, p.name), '[]'::jsonb)
                       from q join public.parents p on p.id = q.parent_id
                      where q.state = 'promised' and q.promise_date <= v_today + 3),
    -- callers today: calls made, families taken and how many of those are still to call
    'team', (select coalesce(jsonb_agg(jsonb_build_object(
               'user_id', w.uid, 'name', coalesce(nullif(pf.full_name, ''), pf.email, 'Unknown'), 'is_me', w.uid = v_me,
               'calls', (select count(*) from public.parent_calls c where c.call_date = v_today and c.created_by = w.uid),
               'connected', (select count(*) from public.parent_calls c
                              where c.call_date = v_today and c.created_by = w.uid and c.outcome = 'connected'),
               'promises', (select count(*) from public.parent_calls c
                             where c.call_date = v_today and c.created_by = w.uid and c.promised_date is not null),
               'taken', (select count(*) from public.call_assignments a where a.call_date = v_today and a.assigned_to = w.uid),
               'left', (select count(*) from q where q.assigned_to = w.uid and q.state = 'due')
             ) order by w.uid = v_me desc, coalesce(nullif(pf.full_name, ''), pf.email)), '[]'::jsonb)
               from who w left join public.profiles pf on pf.id = w.uid),
    'my_taken', (select count(*) from public.call_assignments a where a.call_date = v_today and a.assigned_to = v_me),
    'my_left', (select count(*) from q where q.assigned_to = v_me and q.state = 'due')
  )
    into v_list;

  -- every call made today, about anything
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'parent_id', c.parent_id, 'parent_name', p.name, 'phone', p.phone, 'purpose', c.purpose,
           'outcome', c.outcome, 'picked_by', c.picked_by, 'response', c.response, 'summary', c.summary,
           'promised_date', c.promised_date, 'promised_amount', c.promised_amount, 'follow_up_on', c.follow_up_on,
           'called_at', c.called_at, 'caller_id', c.created_by, 'caller_name', coalesce(nullif(pf.full_name, ''), pf.email)
         ) order by c.called_at desc), '[]'::jsonb)
    into v_calls
    from public.parent_calls c
    join public.parents p on p.id = c.parent_id
    left join public.profiles pf on pf.id = c.created_by
   where c.call_date = v_today;

  -- my calls today, yesterday, in the last 7 and 30 days, and what came in because of them
  with pp as (select x.source_id, x.status from public.parent_promises() x where x.source = 'call'),
  mine as (
    select c.call_date, c.parent_id, c.purpose, c.outcome, c.promised_date, c.promised_amount, pp.status as p_status
      from public.parent_calls c
      left join pp on pp.source_id = c.id
     where c.created_by = v_me and c.call_date > v_today - 30
  ),
  cred as (
    select p.paid_on, p.amount
      from public.recovery_credits rc
      join public.parent_calls c on c.id = rc.call_id and c.created_by = v_me
      join public.payments p on p.id = rc.payment_id
     where p.paid_on > v_today - 30
       and not exists (select 1 from public.payments r where r.reverses_payment_id = p.id)
  ),
  w(key, d_from, d_to) as (
    values ('today', v_today, v_today), ('yesterday', v_today - 1, v_today - 1), ('week', v_today - 6, v_today),
           ('month', v_today - 29, v_today)
  )
  select jsonb_object_agg(w.key, jsonb_build_object(
           'calls', (select count(*) from mine m where m.call_date between w.d_from and w.d_to),
           'families', (select count(distinct m.parent_id) from mine m where m.call_date between w.d_from and w.d_to),
           'fee_calls', (select count(*) from mine m where m.call_date between w.d_from and w.d_to and m.purpose = 'fees'),
           'connected', (select count(*) from mine m where m.call_date between w.d_from and w.d_to and m.outcome = 'connected'),
           'not_reached', (select count(*) from mine m where m.call_date between w.d_from and w.d_to and m.outcome <> 'connected'),
           'promises', (select count(*) from mine m where m.call_date between w.d_from and w.d_to and m.promised_date is not null),
           'promised_amount', (select coalesce(sum(m.promised_amount), 0) from mine m where m.call_date between w.d_from and w.d_to),
           'kept', (select count(*) from mine m where m.call_date between w.d_from and w.d_to and m.p_status = 'kept'),
           'broken', (select count(*) from mine m where m.call_date between w.d_from and w.d_to and m.p_status in ('broken', 'partial')),
           'by_purpose', (select coalesce(jsonb_object_agg(x.purpose, x.n), '{}'::jsonb)
                            from (select m.purpose, count(*) as n from mine m where m.call_date between w.d_from and w.d_to
                                   group by m.purpose) x),
           'recovered', (select coalesce(sum(cr.amount), 0) from cred cr where cr.paid_on between w.d_from and w.d_to)
         ))
    into v_mine
    from w;

  return jsonb_build_object(
    'today', v_today,
    'me', jsonb_build_object(
      'id', v_me,
      'name', (select coalesce(nullif(pf.full_name, ''), pf.email) from public.profiles pf where pf.id = v_me),
      'taken', v_list -> 'my_taken',
      'left', v_list -> 'my_left',
      'stats', v_mine),
    'rules', jsonb_build_object('min_overdue', v_set.call_min_overdue, 'skip_paid_days', v_set.call_skip_paid_days,
                                'gap_days', v_set.call_gap_days, 'high_due', v_set.call_high_due, 'batch', v_set.call_batch,
                                'grace_days', v_set.promise_grace_days),
    'counts', v_list -> 'counts',
    'rows', v_list -> 'rows',
    'promises_due', v_list -> 'promises_due',
    'calls_today', v_calls,
    'team', v_list -> 'team'
  );
end $$;
-- Take one family for today, as in 20261023000009_daily_calls.sql; taking it over also makes it the taker's own
-- (no longer "given by" whoever gave it to the previous caller)
create or replace function public.take_call(p_parent uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.fees_today();
  v_me    uuid := public.current_user_id();
  v_by    uuid;
  v_name  text;
begin
  perform public.assert_staff();
  if not exists (select 1 from public.parents where id = p_parent) then raise exception 'Parent not found'; end if;
  perform pg_advisory_xact_lock(hashtext('fees.call_assignments'));
  select a.assigned_to, coalesce(nullif(p.full_name, ''), p.email)
    into v_by, v_name
    from public.call_assignments a
    left join public.profiles p on p.id = a.assigned_to
   where a.call_date = v_today and a.parent_id = p_parent;
  if v_by = v_me then return; end if;
  if v_by is not null and not public.can_write() then
    raise exception '% is calling this family today', coalesce(v_name, 'Someone else');
  end if;
  insert into public.call_assignments (call_date, parent_id, assigned_to, assigned_by) values (v_today, p_parent, v_me, v_me)
  on conflict (call_date, parent_id) do update
    set assigned_to = excluded.assigned_to, assigned_by = excluded.assigned_by, note = null, assigned_at = now();
end $$;

-- ---------------------------------------------------------------------------
-- Give a family to a caller for a day (today or up to 60 days ahead), or take it off their list
-- ---------------------------------------------------------------------------
create function public.assign_call(p_parent uuid, p_caller uuid, p_date date default null, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.fees_today();
  v_date  date := coalesce(p_date, public.fees_today());
  v_role  public.app_role;
begin
  perform public.assert_staff();
  perform public.assert_sees_school();
  if not exists (select 1 from public.parents where id = p_parent) then raise exception 'Parent not found'; end if;
  select pf.role into v_role from public.profiles pf where pf.id = p_caller;
  if v_role is null or v_role not in ('admin', 'accountant', 'principal', 'caller') then
    raise exception 'Choose a staff member who makes calls';
  end if;
  if v_date < v_today then raise exception 'Choose today or a later day'; end if;
  if v_date > v_today + 60 then raise exception 'Choose a day in the next 60 days'; end if;
  perform pg_advisory_xact_lock(hashtext('fees.call_assignments'));
  insert into public.call_assignments (call_date, parent_id, assigned_to, assigned_by, note)
  values (v_date, p_parent, p_caller, public.current_user_id(), nullif(trim(p_note), ''))
  on conflict (call_date, parent_id) do update
    set assigned_to = excluded.assigned_to, assigned_by = excluded.assigned_by, note = excluded.note, assigned_at = now();
end $$;

-- A caller takes a family off their own list; admin, accountant and principal off anyone's
create function public.unassign_call(p_parent uuid, p_date date default null) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  perform public.assert_staff();
  delete from public.call_assignments a
   where a.call_date = coalesce(p_date, public.fees_today()) and a.parent_id = p_parent
     and (a.assigned_to = public.current_user_id() or public.sees_school());
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Who has which families on a day: every staff member who makes calls (callers first), and each family given
-- to someone that day, with what there is to recover and whether it was called that day
create function public.call_assignments_on(p_date date default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.fees_today();
  v_date  date := coalesce(p_date, public.fees_today());
  v_sess  uuid := public.running_session();
  v_rows  jsonb;
  v_who   jsonb;
begin
  perform public.assert_staff();
  perform public.assert_sees_school();

  with a as (select * from public.call_assignments a where a.call_date = v_date),
  fam as (
    select st.parent_id as pid, sum(b.total_overdue)::bigint as tod,
           jsonb_agg(jsonb_build_object('full_name', b.full_name, 'class_name', b.class_name)
                     order by b.class_order nulls last, b.full_name) as kids
      from public.student_balances(v_sess) b
      join public.students st on st.id = b.student_id
     where st.parent_id in (select a.parent_id from a)
     group by st.parent_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'parent_id', a.parent_id, 'name', p.name, 'phone', p.phone, 'children', coalesce(fam.kids, '[]'::jsonb),
           'to_recover', coalesce(fam.tod, 0),
           'assigned_to', a.assigned_to, 'assigned_name', coalesce(nullif(t.full_name, ''), t.email),
           'assigned_by', a.assigned_by, 'assigned_by_name', coalesce(nullif(g.full_name, ''), g.email),
           'note', a.note, 'assigned_at', a.assigned_at,
           'called', exists (select 1 from public.parent_calls c
                              where c.parent_id = a.parent_id and c.call_date = v_date and c.purpose = 'fees')
         ) order by coalesce(nullif(t.full_name, ''), t.email), a.assigned_at desc), '[]'::jsonb)
    into v_rows
    from a
    join public.parents p on p.id = a.parent_id
    left join fam on fam.pid = a.parent_id
    left join public.profiles t on t.id = a.assigned_to
    left join public.profiles g on g.id = a.assigned_by;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', pf.id, 'name', coalesce(nullif(pf.full_name, ''), pf.email), 'role', pf.role,
           'families', (select count(*) from public.call_assignments a where a.call_date = v_date and a.assigned_to = pf.id),
           'called', (select count(*) from public.call_assignments a
                       where a.call_date = v_date and a.assigned_to = pf.id
                         and exists (select 1 from public.parent_calls c
                                      where c.parent_id = a.parent_id and c.call_date = v_date and c.purpose = 'fees'))
         ) order by pf.role = 'caller' desc, coalesce(nullif(pf.full_name, ''), pf.email)), '[]'::jsonb)
    into v_who
    from public.profiles pf
   where pf.role in ('admin', 'accountant', 'principal', 'caller');

  return jsonb_build_object('date', v_date, 'today', v_today, 'max_date', v_today + 60, 'callers', v_who, 'rows', v_rows);
end $$;

-- ---------------------------------------------------------------------------
-- Money received in a period and what brought it in, the calls made and the activities
--
--   money       receipts paid in the period that were not cancelled, split by what they were counted for (a call,
--               an activity, or nothing: the family paid on its own) and by what they paid (this year, old
--               balance, paid in advance), compared with the period before
--   calls       calls made in the period, picked up, promises made, money that came in after calls
--   activities  running today, and what each brought in during the period
-- ---------------------------------------------------------------------------
create function public.recovery_summary(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today   date := public.fees_today();
  v_sess    uuid := public.running_session();
  v_days    integer;
  v_elapsed integer;
  v_pfrom   date;
  v_pto     date;
  v_bucket  text;
  v_money   jsonb;
  v_calls   jsonb;
  v_acts    jsonb;
begin
  perform public.assert_staff();
  perform public.assert_sees_school();
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Choose a valid period'; end if;
  if p_to - p_from > 731 then raise exception 'Choose a period of two years or less'; end if;
  v_days := p_to - p_from + 1;
  v_elapsed := greatest(1, least(p_to, v_today) - p_from + 1);
  v_pto := p_from - 1;
  v_pfrom := p_from - v_days;
  v_bucket := case when v_days <= 62 then 'day' when v_days <= 400 then 'week' else 'month' end;

  -- money received and what brought it in
  with rc as (
    select p.id, p.student_id, st.parent_id, p.paid_on, p.amount,
           case when cr.call_id is not null then 'calls' when cr.participant_id is not null then 'activities' else 'direct' end as src
      from public.payments p
      join public.students st on st.id = p.student_id
      left join public.recovery_credits cr on cr.payment_id = p.id
     where p.amount > 0 and p.paid_on between v_pfrom and p_to
       and not exists (select 1 from public.payments r where r.reverses_payment_id = p.id)
  ),
  cur as (select * from rc where rc.paid_on >= p_from),
  buckets as (
    select g::date as d
      from generate_series(date_trunc(v_bucket, p_from::timestamp), p_to::timestamp, ('1 ' || v_bucket)::interval) g
  ),
  src as (
    select s.key, coalesce(sum(cur.amount), 0) as amt, count(cur.id) as n,
           count(distinct coalesce(cur.parent_id, cur.student_id)) as fams
      from (values ('calls'), ('activities'), ('direct')) s(key)
      left join cur on cur.src = s.key
     group by s.key
  )
  select jsonb_build_object(
    'received', (select coalesce(sum(cur.amount), 0) from cur),
    'receipts', (select count(*) from cur),
    'families', (select count(distinct coalesce(cur.parent_id, cur.student_id)) from cur),
    'students', (select count(distinct cur.student_id) from cur),
    'prev_received', (select coalesce(sum(rc.amount), 0) from rc where rc.paid_on <= v_pto),
    'by_source', (select jsonb_object_agg(src.key, jsonb_build_object('amount', src.amt, 'receipts', src.n, 'families', src.fams)) from src),
    'by_kind', (select coalesce(jsonb_object_agg(x.kind, x.amt), '{}'::jsonb)
                  from (select a.kind::text as kind, sum(a.amount) as amt from public.allocations a
                         where a.payment_id in (select cur.id from cur) group by a.kind) x),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object(
                'start', b.d, 'calls', coalesce(x.calls, 0), 'activities', coalesce(x.acts, 0), 'direct', coalesce(x.direct, 0),
                'receipts', coalesce(x.n, 0)) order by b.d), '[]'::jsonb)
                from buckets b
                left join (select date_trunc(v_bucket, c2.paid_on::timestamp)::date as d,
                                  sum(c2.amount) filter (where c2.src = 'calls') as calls,
                                  sum(c2.amount) filter (where c2.src = 'activities') as acts,
                                  sum(c2.amount) filter (where c2.src = 'direct') as direct,
                                  count(*) as n
                             from cur c2 group by 1) x on x.d = b.d)
  )
    into v_money;

  with c as (select * from public.parent_calls c where c.call_date between p_from and p_to),
  cred as (   -- receipts of the period counted for a call (made in the period or before)
    select k.parent_id, p.amount
      from public.recovery_credits rc
      join public.parent_calls k on k.id = rc.call_id
      join public.payments p on p.id = rc.payment_id
     where p.paid_on between p_from and p_to
       and not exists (select 1 from public.payments r where r.reverses_payment_id = p.id)
  )
  select jsonb_build_object(
    'calls', (select count(*) from c),
    'families', (select count(distinct c.parent_id) from c),
    'connected', (select count(*) from c where c.outcome = 'connected'),
    'promises', (select count(*) from c where c.promised_date is not null),
    'promised_amount', (select coalesce(sum(c.promised_amount), 0) from c),
    'callers', (select count(distinct c.created_by) from c),
    'recovered', (select coalesce(sum(cred.amount), 0) from cred),
    'families_paid', (select count(distinct cred.parent_id) from cred)
  )
    into v_calls;

  -- activities: what each brought in during the period
  with cr as (
    select rp.activity_id, p.student_id, p.amount
      from public.recovery_credits rc
      join public.recovery_participants rp on rp.id = rc.participant_id
      join public.payments p on p.id = rc.payment_id
     where p.paid_on between p_from and p_to
       and not exists (select 1 from public.payments r where r.reverses_payment_id = p.id)
  ),
  x as (select cr.activity_id, sum(cr.amount) as amt, count(*) as n, count(distinct cr.student_id) as students from cr group by 1)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'name', a.name, 'status', a.status, 'start_date', a.start_date, 'end_date', a.end_date,
           'participants', (select count(*) from public.recovery_participants rp where rp.activity_id = a.id),
           'recovered', coalesce(x.amt, 0), 'receipts', coalesce(x.n, 0), 'students_paid', coalesce(x.students, 0)
         ) order by coalesce(x.amt, 0) desc, a.start_date desc), '[]'::jsonb)
    into v_acts
    from public.recovery_activities a
    left join x on x.activity_id = a.id
   where x.amt > 0 or (a.start_date <= p_to and coalesce(a.end_date, v_today) >= p_from);


  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'days', v_days, 'prev_from', v_pfrom, 'prev_to', v_pto,
                                 'bucket', v_bucket, 'today', v_today),
    'money', v_money,
    'calls', v_calls,
    'activities', jsonb_build_object(
      'running', (select count(*) from public.recovery_activities a
                   where a.status = 'active' and a.start_date <= v_today and coalesce(a.end_date, v_today) >= v_today),
      'starting', (select count(*) from public.recovery_activities a where a.status = 'active' and a.start_date > v_today),
      'students', (select count(*) from public.recovery_participants rp
                     join public.recovery_activities a on a.id = rp.activity_id
                    where a.status = 'active' and a.start_date <= v_today and coalesce(a.end_date, v_today) >= v_today),
      'list', v_acts)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Calls in a period, for the people who run the calling (not the callers themselves)
--
--   totals    calls, families, picked up, not reached, promises (made in the period) and how they turned out,
--             money that came in after calls (receipts of the period counted for a call), compared with the
--             period before
--   trend     per day (week, month): calls, picked up, promises
--   callers   every staff member who called, or has the caller role: effort (calls, families, days calling,
--             calls a day) and result (picked up, promises kept, money after their calls, money per call)
--   impact    families we spoke to about fees in the period: share that paid on or after the first such call;
--             other families with fees due (call_min_overdue to recover now, or who paid fees due in the
--             period): share that paid fees due
-- ---------------------------------------------------------------------------
create function public.call_analytics(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today   date := public.fees_today();
  v_sess    uuid := public.running_session();
  v_days    integer;
  v_elapsed integer;
  v_pfrom   date;
  v_pto     date;
  v_bucket  text;
  v_min     bigint;
  v_calls   jsonb;
  v_impact  jsonb;
begin
  perform public.assert_staff();
  perform public.assert_sees_school();
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Choose a valid period'; end if;
  if p_to - p_from > 731 then raise exception 'Choose a period of two years or less'; end if;
  v_days := p_to - p_from + 1;
  v_elapsed := greatest(1, least(p_to, v_today) - p_from + 1);
  v_pto := p_from - 1;
  v_pfrom := p_from - v_days;
  v_bucket := case when v_days <= 62 then 'day' when v_days <= 400 then 'week' else 'month' end;
  select s.call_min_overdue into v_min from public.school_settings s where s.id = 1;

  with c as (select * from public.parent_calls c where c.call_date between p_from and p_to),
  pp as (select x.* from public.parent_promises() x where x.source = 'call' and x.made_on between p_from and p_to),
  cred as (   -- receipts of the period counted for a call (made in the period or before)
    select k.created_by, k.parent_id, p.amount
      from public.recovery_credits rc
      join public.parent_calls k on k.id = rc.call_id
      join public.payments p on p.id = rc.payment_id
     where p.paid_on between p_from and p_to
       and not exists (select 1 from public.payments r where r.reverses_payment_id = p.id)
  ),
  buckets as (
    select g::date as d
      from generate_series(date_trunc(v_bucket, p_from::timestamp), p_to::timestamp, ('1 ' || v_bucket)::interval) g
  ),
  who as (
    select c.created_by as uid from c
    union select cred.created_by from cred
    union select pf.id from public.profiles pf where pf.role = 'caller'
  ),
  per as (
    select w.uid, coalesce(nullif(pf.full_name, ''), pf.email, 'Unknown') as name, pf.role,
           k.calls, k.families, k.connected, k.days,
           pr.n as promises, pr.amt as promised_amount, pr.kept, pr.broken, pr.pending,
           cr.amt as recovered, cr.n as receipts, cr.fams as families_paid
      from who w
      left join public.profiles pf on pf.id = w.uid
     cross join lateral (select count(*) as calls, count(distinct c.parent_id) as families,
                                count(*) filter (where c.outcome = 'connected') as connected,
                                count(distinct c.call_date) as days
                           from c where c.created_by = w.uid) k
     cross join lateral (select count(*) as n, coalesce(sum(pp.promised_amount), 0) as amt,
                                count(*) filter (where pp.status = 'kept') as kept,
                                count(*) filter (where pp.status in ('broken', 'partial')) as broken,
                                count(*) filter (where pp.status = 'pending') as pending
                           from pp where pp.made_by = w.uid) pr
     cross join lateral (select coalesce(sum(cred.amount), 0) as amt, count(*) as n, count(distinct cred.parent_id) as fams
                           from cred where cred.created_by = w.uid) cr
     where w.uid is not null
  )
  select jsonb_build_object(
    'calls', (select count(*) from c),
    'prev_calls', (select count(*) from public.parent_calls k where k.call_date between v_pfrom and v_pto),
    'families', (select count(distinct c.parent_id) from c),
    'fee_calls', (select count(*) from c where c.purpose = 'fees'),
    'connected', (select count(*) from c where c.outcome = 'connected'),
    'not_reached', (select count(*) from c where c.outcome <> 'connected'),
    'callers', (select count(distinct c.created_by) from c),
    'per_day', (select round(count(*)::numeric / v_elapsed, 1) from c),
    'by_purpose', (select coalesce(jsonb_object_agg(x.purpose, x.n), '{}'::jsonb)
                     from (select c.purpose, count(*) as n from c group by c.purpose) x),
    'by_outcome', (select coalesce(jsonb_object_agg(x.outcome, x.n), '{}'::jsonb)
                     from (select c.outcome, count(*) as n from c group by c.outcome) x),
    'by_response', (select coalesce(jsonb_object_agg(x.response, x.n), '{}'::jsonb)
                      from (select c.response, count(*) as n from c where c.response is not null group by c.response) x),
    'promises', (select count(*) from pp),
    'promised_amount', (select coalesce(sum(pp.promised_amount), 0) from pp),
    'kept', (select count(*) from pp where pp.status = 'kept'),
    'kept_on_time', (select count(*) from pp where pp.timing in ('early', 'on_date')),
    'partial', (select count(*) from pp where pp.status = 'partial'),
    'broken', (select count(*) from pp where pp.status = 'broken'),
    'pending', (select count(*) from pp where pp.status = 'pending'),
    'promise_paid', (select coalesce(sum(pp.paid), 0) from pp),
    'recovered', (select coalesce(sum(cred.amount), 0) from cred),
    'families_paid', (select count(distinct cred.parent_id) from cred),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('start', b.d, 'calls', coalesce(x.n, 0),
                                                           'connected', coalesce(x.conn, 0), 'promises', coalesce(x.prom, 0))
                                        order by b.d), '[]'::jsonb)
                from buckets b
                left join (select date_trunc(v_bucket, c.call_date::timestamp)::date as d, count(*) as n,
                                  count(*) filter (where c.outcome = 'connected') as conn,
                                  count(*) filter (where c.promised_date is not null) as prom
                             from c group by 1) x on x.d = b.d),
    'by_caller', (select coalesce(jsonb_agg(jsonb_build_object(
                    'user_id', per.uid, 'name', per.name, 'role', per.role,
                    'calls', per.calls, 'families', per.families, 'connected', per.connected,
                    'not_reached', per.calls - per.connected, 'days', per.days,
                    'calls_per_day', round(per.calls::numeric / v_elapsed, 1),
                    'connect_pct', case when per.calls > 0 then round(100.0 * per.connected / per.calls) end,
                    'promises', per.promises, 'promised_amount', per.promised_amount,
                    'kept', per.kept, 'broken', per.broken, 'pending', per.pending,
                    'kept_pct', case when per.kept + per.broken > 0 then round(100.0 * per.kept / (per.kept + per.broken)) end,
                    'recovered', per.recovered, 'receipts', per.receipts, 'families_paid', per.families_paid,
                    'per_call', case when per.calls > 0 then round(per.recovered::numeric / per.calls)::bigint end
                  ) order by per.calls desc, per.recovered desc, per.name), '[]'::jsonb)
                    from per)
  )
    into v_calls;

  -- does talking to families make a difference?
  with fam as materialized (   -- what each family owes now
    select st.parent_id as pid, sum(b.total_overdue) as tod
      from public.academic_sessions s
     cross join lateral public.student_balances(s.id) b
      join public.students st on st.id = b.student_id
     where s.id = v_sess and st.parent_id is not null
     group by st.parent_id
  ),
  spoke as (
    select c.parent_id as pid, min(c.call_date) as first_on
      from public.parent_calls c
     where c.call_date between p_from and p_to and c.purpose = 'fees' and c.outcome = 'connected'
     group by c.parent_id
  ),
  pay as (
    select st.parent_id as pid, p.id, p.paid_on, p.amount
      from public.payments p
      join public.students st on st.id = p.student_id
     where st.parent_id is not null and p.amount > 0 and p.paid_on between p_from and p_to
       and not exists (select 1 from public.payments r where r.reverses_payment_id = p.id)
  ),
  paid_due as (   -- families who paid fees that had fallen due (old dues, or installments past their due date)
    select distinct pay.pid
      from pay
      join public.allocations a on a.payment_id = pay.id
      left join public.installments i on i.id = a.installment_id
     where a.amount > 0 and (a.kind = 'arrears' or (a.kind = 'current' and i.due_date <= a.paid_on))
  ),
  called as (
    select s.pid, coalesce(sum(y.amount), 0) as amt
      from spoke s left join pay y on y.pid = s.pid and y.paid_on >= s.first_on
     group by s.pid
  ),
  pop as (select fam.pid from fam where fam.tod >= v_min union select paid_due.pid from paid_due),
  others as (
    select o.pid, exists (select 1 from paid_due d where d.pid = o.pid) as paid, coalesce(sum(y.amount), 0) as amt
      from pop o
      left join pay y on y.pid = o.pid
     where not exists (select 1 from spoke s where s.pid = o.pid)
     group by o.pid
  ),
  r as (
    select (select count(*) from called) as spoke,
           (select count(*) from called where called.amt > 0) as spoke_paid,
           (select coalesce(sum(called.amt), 0) from called) as spoke_amount,
           (select count(*) from others) as others,
           (select count(*) from others where others.paid) as others_paid,
           (select coalesce(sum(others.amt) filter (where others.paid), 0) from others) as others_amount
  )
  select jsonb_build_object(
           'spoke', r.spoke, 'spoke_paid', r.spoke_paid, 'spoke_amount', r.spoke_amount,
           'spoke_pct', case when r.spoke > 0 then round(100.0 * r.spoke_paid / r.spoke) end,
           'others', r.others, 'others_paid', r.others_paid, 'others_amount', r.others_amount,
           'others_pct', case when r.others > 0 then round(100.0 * r.others_paid / r.others) end,
           'lift', case when r.spoke > 0 and r.others > 0 and r.others_paid > 0
                        then round((r.spoke_paid::numeric / r.spoke) / (r.others_paid::numeric / r.others), 1) end)
    into v_impact
    from r;


  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'days', v_days, 'prev_from', v_pfrom, 'prev_to', v_pto,
                                 'bucket', v_bucket, 'today', v_today),
    'calls', v_calls,
    'impact', v_impact
  );
end $$;

-- ---------------------------------------------------------------------------
-- Home: this year's fees and what is left to recover (as in 20261025000012_home.sql), and the school:
-- students enrolled this year, their families and classes, and students by status
-- ---------------------------------------------------------------------------
create or replace function public.home_fees(p_session uuid)
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
  ),
  enr as (   -- enrolled this year
    select sb.*, st.parent_id from sb join public.students st on st.id = sb.student_id where sb.class_id is not null
  )
  select jsonb_build_object(
           'session', jsonb_build_object('id', v_sess.id, 'name', v_sess.name, 'is_current', v_sess.is_current,
                                         'start_date', v_sess.start_date, 'end_date', v_sess.end_date),
           'total_fee', t.total_fee, 'received', t.received, 'due_now', t.due_now, 'due_later', t.due_later,
           'balance', t.balance, 'old_balance', t.old_balance, 'old_balance_received', t.old_balance_received,
           'received_pct', case when t.total_fee > 0 then round(100.0 * t.received / t.total_fee) end,
           'to_recover', t.due_now + t.old_balance,
           'students_to_recover', t.students, 'nothing_paid', t.nothing_paid,
           'school', (select jsonb_build_object(
                        'students', count(*), 'families', count(distinct enr.parent_id), 'classes', count(distinct enr.class_id),
                        'status', jsonb_build_object(
                          'paid_up', count(*) filter (where enr.fee_status = 'paid_up'),
                          'partial', count(*) filter (where enr.fee_status = 'partial'),
                          'not_paying', count(*) filter (where enr.fee_status = 'not_paying'),
                          'arrears_only', count(*) filter (where enr.fee_status = 'arrears_only'),
                          'free', count(*) filter (where enr.fee_status in ('free', 'no_plan'))))
                        from enr))
    into v_out
    from t;
  return v_out;
end $$;

drop function public.recovery_dashboard(date, date);
drop function public.home_chase();

revoke execute on all functions in schema public from public;
