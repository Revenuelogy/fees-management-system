-- =============================================================================
-- Fee position: every total of the year in one place, for the school, a class or a section
--
--   this year           total_fee (fees of the year after concessions), received, balance (still to receive),
--                       due_now (installments whose due date has passed, not paid), due_later, due_so_far
--                       (fees whose due date has passed, paid or not)
--   previous years      old_opening (left unpaid from previous years when the year started), old_received (paid
--                       since), old_balance (still unpaid)
--   both together       total_fee_all = total_fee + old_opening, received_all = received + old_received,
--                       balance_all = balance + old_balance, to_recover = due_now + old_balance
--   students            enrolled (in the class / section), with something due till today or from previous years,
--                       and of them, with nothing paid this year; enrolled students by status
--
-- Students who are not enrolled this year (left) count for the whole school only, as in student_balances().
-- =============================================================================

create function public.fee_position(p_session uuid, p_class uuid default null, p_section text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  perform public.assert_staff();
  perform public.assert_sees_school();
  if not exists (select 1 from public.academic_sessions where id = p_session) then raise exception 'Unknown session'; end if;
  if p_class is not null and not exists (select 1 from public.classes where id = p_class) then raise exception 'Unknown class'; end if;

  with sb as materialized (
    select b.* from public.student_balances(p_session) b
     where (p_class is null or b.class_id = p_class) and (p_section is null or b.section = p_section)
  ),
  t as (
    select coalesce(sum(sb.expected), 0)::bigint as total_fee,
           coalesce(sum(sb.received), 0)::bigint as received,
           coalesce(sum(sb.pending), 0)::bigint as balance,
           coalesce(sum(sb.overdue), 0)::bigint as due_now,
           coalesce(sum(sb.pending - sb.overdue), 0)::bigint as due_later,
           coalesce(sum(sb.due_expected), 0)::bigint as due_so_far,
           coalesce(sum(sb.prev_opening), 0)::bigint as old_opening,
           coalesce(sum(sb.prev_recovered), 0)::bigint as old_received,
           coalesce(sum(sb.prev_pending), 0)::bigint as old_balance,
           count(*) filter (where sb.class_id is not null) as students,
           count(*) filter (where sb.overdue + sb.prev_pending > 0) as students_due,
           count(*) filter (where sb.overdue + sb.prev_pending > 0 and sb.fee_status = 'not_paying') as nothing_paid,
           jsonb_build_object(
             'paid_up', count(*) filter (where sb.class_id is not null and sb.fee_status = 'paid_up'),
             'partial', count(*) filter (where sb.class_id is not null and sb.fee_status = 'partial'),
             'not_paying', count(*) filter (where sb.class_id is not null and sb.fee_status = 'not_paying'),
             'arrears_only', count(*) filter (where sb.class_id is not null and sb.fee_status = 'arrears_only'),
             'free', count(*) filter (where sb.class_id is not null and sb.fee_status in ('free', 'no_plan'))) as status
      from sb
  )
  select jsonb_build_object(
           'total_fee', t.total_fee, 'received', t.received, 'balance', t.balance,
           'due_now', t.due_now, 'due_later', t.due_later, 'due_so_far', t.due_so_far,
           'received_pct', case when t.total_fee > 0 then round(100.0 * t.received / t.total_fee) end,
           'due_received_pct', case when t.due_so_far > 0 then round(100.0 * (t.due_so_far - t.due_now) / t.due_so_far) end,
           'old_opening', t.old_opening, 'old_received', t.old_received, 'old_balance', t.old_balance,
           'total_fee_all', t.total_fee + t.old_opening, 'received_all', t.received + t.old_received,
           'balance_all', t.balance + t.old_balance, 'to_recover', t.due_now + t.old_balance,
           'students', t.students, 'students_due', t.students_due, 'nothing_paid', t.nothing_paid, 'status', t.status)
    into v_out
    from t;
  return v_out;
end $$;

revoke execute on all functions in schema public from public;
