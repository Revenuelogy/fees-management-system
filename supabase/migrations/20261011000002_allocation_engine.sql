-- =============================================================================
-- Payment allocation engine
--
-- Every payment is split into allocations: which session, installment and fee
-- head it paid for. Allocations are derived data. They are rebuilt for a
-- student whenever that student's charges, payments or payment targets change,
-- so they always reflect the current rule and the current fee plan.
--
-- Rule (per payment, in date order):
--   1. Explicit targets chosen at the counter (payment_targets) win.
--   2. ERP hints on the receipt (session / fee head / installment) come next.
--   3. Default rule:
--        oldest_first  : oldest session -> earliest installment -> fee head priority
--        current_first : running session first, then the oldest dues
--   4. Anything left over is stored as an advance (no charge yet).
-- A reversal row (cancelled receipt) mirrors the original's allocations with
-- negative amounts and re-opens those dues.
-- =============================================================================

create function public.reallocate_student(p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order   text;
  -- open charges in default (oldest-first) order
  a_id      uuid[];
  a_sess    uuid[];
  a_start   date[];
  a_inst    uuid[];
  a_head    uuid[];
  a_rem     bigint[];
  n         integer;
  -- allocation rows being built
  r_pay     uuid[]    := '{}';
  r_idx     integer[] := '{}';
  r_amt     bigint[]  := '{}';
  r_kind    public.allocation_kind[] := '{}';
  r_inf     boolean[] := '{}';
  r_paid    date[]    := '{}';
  r_psess   uuid[]    := '{}';
  pay       record;
  t         record;
  v_left    bigint;
  v_amt     bigint;
  v_hint    boolean;
  v_pass    integer;
  i         integer;
  k         integer;
  m         integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('fees.realloc:' || p_student::text, 0));
  select allocation_order into v_order from public.school_settings where id = 1;

  delete from public.allocations where student_id = p_student;

  select array_agg(sc.id          order by s.start_date, i2.number, fh.priority, fh.name, sc.id),
         array_agg(sc.session_id  order by s.start_date, i2.number, fh.priority, fh.name, sc.id),
         array_agg(s.start_date   order by s.start_date, i2.number, fh.priority, fh.name, sc.id),
         array_agg(sc.installment_id order by s.start_date, i2.number, fh.priority, fh.name, sc.id),
         array_agg(sc.fee_head_id order by s.start_date, i2.number, fh.priority, fh.name, sc.id),
         array_agg(sc.net_amount  order by s.start_date, i2.number, fh.priority, fh.name, sc.id)
    into a_id, a_sess, a_start, a_inst, a_head, a_rem
    from public.student_charges sc
    join public.installments i2       on i2.id = sc.installment_id
    join public.academic_sessions s   on s.id = sc.session_id
    join public.fee_heads fh          on fh.id = sc.fee_head_id
   where sc.student_id = p_student
     and sc.net_amount > 0;
  n := coalesce(array_length(a_id, 1), 0);

  -- date order; a reversal is always processed after the payment it cancels,
  -- even if it was dated or timestamped earlier
  for pay in
    select p.id, p.amount, p.paid_on, p.session_id, p.source, p.reverses_payment_id,
           p.session_hint_id, p.fee_head_hint_id, p.installment_hint_id,
           s.start_date as pay_start
      from public.payments p
      join public.academic_sessions s on s.id = p.session_id
      left join public.payments o on o.id = p.reverses_payment_id
     where p.student_id = p_student
     order by greatest(p.paid_on, coalesce(o.paid_on, p.paid_on)),
              greatest(p.created_at, coalesce(o.created_at, p.created_at)),
              (p.reverses_payment_id is not null),
              p.id
  loop
    -- Reversal: mirror the original payment's allocations and re-open those dues
    if pay.reverses_payment_id is not null then
      m := coalesce(array_length(r_pay, 1), 0);
      for k in 1 .. m loop
        if r_pay[k] = pay.reverses_payment_id then
          r_pay   := array_append(r_pay, pay.id);
          r_idx   := array_append(r_idx, r_idx[k]);
          r_amt   := array_append(r_amt, -r_amt[k]);
          r_kind  := array_append(r_kind, r_kind[k]);
          r_inf   := array_append(r_inf, r_inf[k]);
          r_paid  := array_append(r_paid, pay.paid_on);
          r_psess := array_append(r_psess, pay.session_id);
          if r_idx[k] is not null then
            a_rem[r_idx[k]] := a_rem[r_idx[k]] + r_amt[k];
          end if;
        end if;
      end loop;
      continue;
    end if;

    v_left := pay.amount;

    -- 1. explicit targets
    for t in
      select pt.charge_id, pt.amount, array_position(a_id, pt.charge_id) as idx
        from public.payment_targets pt
       where pt.payment_id = pay.id
       order by array_position(a_id, pt.charge_id)
    loop
      exit when v_left <= 0;
      continue when t.idx is null;
      v_amt := least(t.amount, a_rem[t.idx], v_left);
      if v_amt > 0 then
        a_rem[t.idx] := a_rem[t.idx] - v_amt;
        v_left := v_left - v_amt;
        r_pay   := array_append(r_pay, pay.id);
        r_idx   := array_append(r_idx, t.idx);
        r_amt   := array_append(r_amt, v_amt);
        r_kind  := array_append(r_kind, case when a_sess[t.idx] = pay.session_id then 'current'
                                             when a_start[t.idx] < pay.pay_start then 'arrears'
                                             else 'advance' end::public.allocation_kind);
        r_inf   := array_append(r_inf, false);
        r_paid  := array_append(r_paid, pay.paid_on);
        r_psess := array_append(r_psess, pay.session_id);
      end if;
    end loop;

    -- 2. hints, 3a. running session first (current_first only), 3b. default order
    v_hint := pay.session_hint_id is not null or pay.fee_head_hint_id is not null or pay.installment_hint_id is not null;
    for v_pass in 1 .. 3 loop
      exit when v_left <= 0;
      continue when v_pass = 1 and not v_hint;
      continue when v_pass = 2 and v_order <> 'current_first';
      for i in 1 .. n loop
        exit when v_left <= 0;
        continue when a_rem[i] <= 0;
        if v_pass = 1 then
          continue when pay.session_hint_id is not null and a_sess[i] <> pay.session_hint_id;
          continue when pay.fee_head_hint_id is not null and a_head[i] <> pay.fee_head_hint_id;
          continue when pay.installment_hint_id is not null and a_inst[i] <> pay.installment_hint_id;
        elsif v_pass = 2 then
          continue when a_sess[i] <> pay.session_id;
        end if;
        v_amt := least(a_rem[i], v_left);
        a_rem[i] := a_rem[i] - v_amt;
        v_left := v_left - v_amt;
        r_pay   := array_append(r_pay, pay.id);
        r_idx   := array_append(r_idx, i);
        r_amt   := array_append(r_amt, v_amt);
        r_kind  := array_append(r_kind, case when a_sess[i] = pay.session_id then 'current'
                                             when a_start[i] < pay.pay_start then 'arrears'
                                             else 'advance' end::public.allocation_kind);
        r_inf   := array_append(r_inf, v_pass <> 1 and pay.source = 'import');
        r_paid  := array_append(r_paid, pay.paid_on);
        r_psess := array_append(r_psess, pay.session_id);
      end loop;
    end loop;

    -- 4. advance (nothing left to pay against)
    if v_left > 0 then
      r_pay   := array_append(r_pay, pay.id);
      r_idx   := array_append(r_idx, null::integer);
      r_amt   := array_append(r_amt, v_left);
      r_kind  := array_append(r_kind, 'advance'::public.allocation_kind);
      r_inf   := array_append(r_inf, false);
      r_paid  := array_append(r_paid, pay.paid_on);
      r_psess := array_append(r_psess, pay.session_id);
    end if;
  end loop;

  insert into public.allocations
    (payment_id, student_id, charge_id, session_id, installment_id, fee_head_id,
     paid_on, payment_session_id, amount, kind, is_inferred)
  select r_pay[g.x], p_student, a_id[r_idx[g.x]], a_sess[r_idx[g.x]], a_inst[r_idx[g.x]], a_head[r_idx[g.x]],
         r_paid[g.x], r_psess[g.x], r_amt[g.x], r_kind[g.x], r_inf[g.x]
    from generate_subscripts(r_pay, 1) as g(x)
   where r_amt[g.x] <> 0;
end $$;

create function public.reallocate_all() returns integer
language plpgsql security definer set search_path = public as $$
declare
  s uuid;
  c integer := 0;
begin
  for s in
    select id from public.students st
     where exists (select 1 from public.payments p where p.student_id = st.id)
        or exists (select 1 from public.allocations a where a.student_id = st.id)
  loop
    perform public.reallocate_student(s);
    c := c + 1;
  end loop;
  return c;
end $$;

-- Public RPC wrapper (admin only)
create function public.rerun_allocation() returns integer
language plpgsql security definer set search_path = public as $$
declare c integer;
begin
  perform public.assert_admin();
  c := public.reallocate_all();
  perform public.audit('rerun_allocation', 'allocations', null, jsonb_build_object('students', c));
  return c;
end $$;

-- -----------------------------------------------------------------------------
-- Automatic re-allocation triggers (statement level, one run per student)
-- Set `fees.skip_realloc = on` (transaction-local) to batch, then re-run manually.
-- -----------------------------------------------------------------------------
create function public.realloc_skipped() returns boolean
language sql stable as $$
  select coalesce(current_setting('fees.skip_realloc', true), '') = 'on'
$$;

create function public.trg_realloc_new_rows() returns trigger
language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  if public.realloc_skipped() then return null; end if;
  for s in select distinct student_id from changed_rows loop
    perform public.reallocate_student(s);
  end loop;
  return null;
end $$;

create function public.trg_realloc_both_rows() returns trigger
language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  if public.realloc_skipped() then return null; end if;
  for s in select student_id from changed_rows union select student_id from old_rows loop
    perform public.reallocate_student(s);
  end loop;
  return null;
end $$;

create trigger student_charges_realloc_ins after insert on public.student_charges
  referencing new table as changed_rows for each statement execute function public.trg_realloc_new_rows();
create trigger student_charges_realloc_upd after update on public.student_charges
  referencing new table as changed_rows old table as old_rows for each statement execute function public.trg_realloc_both_rows();
create trigger student_charges_realloc_del after delete on public.student_charges
  referencing old table as changed_rows for each statement execute function public.trg_realloc_new_rows();

create trigger payments_realloc_ins after insert on public.payments
  referencing new table as changed_rows for each statement execute function public.trg_realloc_new_rows();

-- payment_targets has no student_id; map through payments
create function public.trg_realloc_targets() returns trigger
language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  if public.realloc_skipped() then return null; end if;
  for s in select distinct p.student_id from changed_rows r join public.payments p on p.id = r.payment_id loop
    perform public.reallocate_student(s);
  end loop;
  return null;
end $$;
create trigger payment_targets_realloc_ins after insert on public.payment_targets
  referencing new table as changed_rows for each statement execute function public.trg_realloc_targets();
create trigger payment_targets_realloc_del after delete on public.payment_targets
  referencing old table as changed_rows for each statement execute function public.trg_realloc_targets();

-- Global rule changes re-run everything
create function public.trg_realloc_all() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.realloc_skipped() then return null; end if;
  perform public.reallocate_all();
  return null;
end $$;

create trigger school_settings_realloc after update of allocation_order on public.school_settings
  for each row when (old.allocation_order is distinct from new.allocation_order)
  execute function public.trg_realloc_all();
create function public.trg_fee_heads_priority() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.realloc_skipped() then return null; end if;
  if exists (select 1 from changed_rows n join old_rows o on o.id = n.id
              where n.priority is distinct from o.priority) then
    perform public.reallocate_all();
  end if;
  return null;
end $$;
create trigger fee_heads_realloc after update on public.fee_heads
  referencing new table as changed_rows old table as old_rows
  for each statement execute function public.trg_fee_heads_priority();

create function public.trg_installments_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.realloc_skipped() then return null; end if;
  if exists (select 1 from changed_rows n join old_rows o on o.id = n.id
              where n.number is distinct from o.number) then
    perform public.reallocate_all();
  end if;
  return null;
end $$;
create trigger installments_realloc after update on public.installments
  referencing new table as changed_rows old table as old_rows
  for each statement execute function public.trg_installments_number();

-- Helper to run a block with triggers paused and restore the previous value
create function public.set_skip_realloc(p_on boolean) returns text
language plpgsql as $$
declare prev text := coalesce(current_setting('fees.skip_realloc', true), '');
begin
  perform set_config('fees.skip_realloc', case when p_on then 'on' else 'off' end, true);
  return prev;
end $$;
