-- =============================================================================
-- Demo data for local development (`npm run db:reset` runs this file).
-- Creates a login:  admin@school.test / admin12345
-- Two sessions (2025-26 closed, 2026-27 running), ~330 students, realistic
-- payment behaviour (early, on-time, late, partial, defaulters), arrears,
-- concessions, transport, cancelled receipts and a few notes.
-- Deterministic: the same data is produced on every reset.
-- =============================================================================

-- Local admin user (password admin12345, hashed with src/server/auth/password.mjs) -------
do $$
declare uid uuid := '11111111-1111-1111-1111-111111111111';
begin
  if not exists (select 1 from public.app_users where lower(email) = 'admin@school.test') then
    insert into public.app_users (id, email, password_hash)
    values (uid, 'admin@school.test',
            'scrypt$16384$8$1$r1wYA357eU3Hvu03+PwNhw==$mf5rDXRi60HMbMzRAoa/40vfkyTTETb3E44HsmmHsmNMr9V8ojHqbJGGC+TbnXlqi9xwpEpfLHXrAUw34Findw==');
    update public.profiles set full_name = 'School Admin' where id = uid;
  end if;
end $$;

-- School data -------------------------------------------------------------------
do $$
declare
  boys    text[] := array['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Ayaan','Krishna','Ishaan','Shaurya',
                          'Atharv','Advik','Pranav','Advait','Dhruv','Kabir','Ritvik','Aarush','Kian','Darsh','Veer','Rudra',
                          'Yash','Harsh','Rohan','Kunal','Manav','Nikhil','Parth','Rahul','Siddharth','Tanmay','Utkarsh','Varun'];
  girls   text[] := array['Saanvi','Aanya','Aadhya','Aaradhya','Ananya','Pari','Anika','Navya','Diya','Myra','Sara','Ira',
                          'Ahana','Anvi','Prisha','Riya','Kavya','Isha','Meera','Nisha','Pooja','Shruti','Tanvi','Vanya',
                          'Zoya','Khushi','Neha','Palak','Simran','Sneha'];
  surnames text[] := array['Sharma','Verma','Gupta','Agarwal','Jain','Singh','Choudhary','Meena','Yadav','Kumawat','Saini',
                           'Joshi','Mathur','Khandelwal','Goyal','Mittal','Bansal','Rathore','Shekhawat','Soni','Purohit',
                           'Tiwari','Mishra','Pareek','Sethi'];
  fathers text[] := array['Rajesh','Suresh','Mahesh','Ramesh','Dinesh','Mukesh','Sanjay','Vijay','Ajay','Manoj','Anil','Sunil',
                          'Rakesh','Naresh','Pankaj','Deepak','Ashok','Vinod','Pradeep','Sandeep','Amit','Sumit','Vikas',
                          'Rohit','Gaurav'];
  mothers text[] := array['Sunita','Anita','Kavita','Rekha','Seema','Neetu','Pooja','Priya','Mamta','Suman','Geeta','Asha',
                          'Manju','Ritu','Shalini','Swati','Preeti','Renu','Usha','Kiran'];
  class_names text[] := array['Nursery','LKG','UKG','Class 1','Class 2','Class 3','Class 4','Class 5','Class 6','Class 7',
                              'Class 8','Class 9','Class 10'];
  modes   public.payment_mode[] := array['cash','cash','cash','cash','upi','upi','upi','upi','bank_transfer','cheque','cheque','card'];
  profiles text[] := array['early','early','early','ontime','ontime','ontime','late','late','partial','partial','defaulter'];

  v_today  date := public.fees_today();
  s_prev   uuid;
  s_cur    uuid;
  cls      uuid[] := '{}';
  h_tui    uuid; h_ann uuid; h_exam uuid; h_trans uuid;
  inst     record;
  k        integer;
  n        integer;
  j        integer;
  v_id     uuid;
  v_male   boolean;
  v_first  text;
  v_sur    text;
  v_prof   text;
  v_adm    integer := 0;
  v_sec    text;
  v_has_prev boolean;
  srow     record;
  ins      record;
  v_due    bigint;
  v_paid_on date;
  v_amt    bigint;
  v_frac   numeric;
  pr       record;
begin
  perform setseed(0.2026);
  perform set_config('fees.skip_realloc', 'on', true);

  update public.school_settings
     set school_name = 'Sunrise Public School',
         address = '12 Station Road, Malviya Nagar, Jaipur, Rajasthan 302017',
         phone = '+91 141 400 0000', email = 'accounts@sunrise.test',
         affiliation = 'Affiliated to CBSE, New Delhi', receipt_prefix = 'SPS'
   where id = 1;

  insert into public.academic_sessions (name, start_date, end_date, is_current)
  values ('2025-26', '2025-04-01', '2026-03-31', false) returning id into s_prev;
  insert into public.academic_sessions (name, start_date, end_date, is_current)
  values ('2026-27', '2026-04-01', '2027-03-31', true) returning id into s_cur;

  insert into public.installments (session_id, number, name, due_date) values
    (s_prev, 1, 'Installment 1 (Apr-Jul)', '2025-04-10'),
    (s_prev, 2, 'Installment 2 (Aug-Nov)', '2025-08-10'),
    (s_prev, 3, 'Installment 3 (Dec-Mar)', '2025-12-10'),
    (s_cur,  1, 'Installment 1 (Apr-Jul)', '2026-04-10'),
    (s_cur,  2, 'Installment 2 (Aug-Nov)', '2026-08-10'),
    (s_cur,  3, 'Installment 3 (Dec-Mar)', '2026-12-10');

  for k in 1 .. array_length(class_names, 1) loop
    insert into public.classes (name, sort_order) values (class_names[k], k) returning id into v_id;
    cls := cls || v_id;
  end loop;

  insert into public.fee_heads (name, priority) values ('Tuition Fee', 10) returning id into h_tui;
  insert into public.fee_heads (name, priority) values ('Annual Charges', 20) returning id into h_ann;
  insert into public.fee_heads (name, priority) values ('Exam Fee', 30) returning id into h_exam;
  insert into public.fee_heads (name, priority) values ('Transport Fee', 40) returning id into h_trans;

  -- fee structure (paise). 2026-27 is ~8% dearer.
  for inst in select i.*, (i.session_id = s_cur) as is_cur from public.installments i loop
    for k in 1 .. array_length(cls, 1) loop
      insert into public.fee_structures (class_id, installment_id, fee_head_id, amount)
      values (cls[k], inst.id, h_tui,
              (round((6000 + k * 700) * case when inst.is_cur then 1.08 else 1 end / 100) * 100 * 100)::bigint);
      if inst.number = 1 then
        insert into public.fee_structures (class_id, installment_id, fee_head_id, amount)
        values (cls[k], inst.id, h_ann, ((4000 + k * 100) * case when inst.is_cur then 1.1 else 1 end * 100)::bigint);
      end if;
      if inst.number in (2, 3) and k >= 4 then
        insert into public.fee_structures (class_id, installment_id, fee_head_id, amount)
        values (cls[k], inst.id, h_exam, 120000);
      end if;
    end loop;
  end loop;

  -- students ------------------------------------------------------------------
  create temp table _seed_stu (id uuid, profile text, transport boolean, conc numeric) on commit drop;

  -- current-year classes (index k), plus last year's Class 10 who have passed out (k = 14)
  for k in 1 .. array_length(cls, 1) + 1 loop
    n := 18 + floor(random() * 12)::int;
    for j in 1 .. n loop
      v_adm := v_adm + 1;
      v_male := random() < 0.52;
      v_first := case when v_male then boys[1 + floor(random() * array_length(boys, 1))::int]
                      else girls[1 + floor(random() * array_length(girls, 1))::int] end;
      v_sur := surnames[1 + floor(random() * array_length(surnames, 1))::int];
      v_prof := profiles[1 + floor(random() * array_length(profiles, 1))::int];
      v_sec := case when n > 24 and j > n / 2 then 'B' else 'A' end;
      -- most students in UKG and above were here last year (one class lower)
      v_has_prev := (k >= 2 and random() < 0.9) or k = 14;

      insert into public.students (admission_no, full_name, father_name, mother_name, phone, gender, dob,
                                   address, admission_date, status)
      values ('SPS' || lpad(v_adm::text, 4, '0'),
              v_first || ' ' || v_sur,
              fathers[1 + floor(random() * array_length(fathers, 1))::int] || ' ' || v_sur,
              mothers[1 + floor(random() * array_length(mothers, 1))::int] || ' ' || v_sur,
              '9' || lpad(floor(random() * 999999999)::text, 9, '0'),
              case when v_male then 'M' else 'F' end,
              make_date(2023 - least(k, 13) - 3 + 1, 1 + floor(random() * 12)::int, 1 + floor(random() * 28)::int),
              (1 + floor(random() * 200)::int) || ', ' || (array['Malviya Nagar','Mansarovar','Vaishali Nagar','C-Scheme',
                 'Jagatpura','Raja Park','Sanganer','Tonk Road'])[1 + floor(random() * 8)::int] || ', Jaipur',
              case when v_has_prev then date '2025-04-01' - (floor(random() * 1500))::int else date '2026-04-01' - (floor(random() * 20))::int end,
              case when k = 14 then 'passed_out'::public.student_status else 'active' end)
      returning id into v_id;

      if k <= array_length(cls, 1) then
        insert into public.enrollments (student_id, session_id, class_id, section, roll_no)
        values (v_id, s_cur, cls[k], v_sec, j::text);
      end if;
      if v_has_prev then
        insert into public.enrollments (student_id, session_id, class_id, section, roll_no)
        values (v_id, s_prev, cls[k - 1], v_sec, j::text);
      end if;

      insert into _seed_stu values (
        v_id, v_prof, random() < 0.35,
        case when random() < 0.02 then 100 when random() < 0.08 then 50 when random() < 0.05 then 25 else 0 end);
    end loop;
  end loop;

  -- charges from structure, then transport + concessions
  insert into public.student_charges (student_id, session_id, installment_id, fee_head_id, amount, source)
  select e.student_id, e.session_id, fs.installment_id, fs.fee_head_id, fs.amount, 'structure'
    from public.enrollments e
    join public.fee_structures fs on fs.class_id = e.class_id
    join public.installments i on i.id = fs.installment_id and i.session_id = e.session_id;

  insert into public.student_charges (student_id, session_id, installment_id, fee_head_id, amount, source)
  select e.student_id, e.session_id, i.id, h_trans, case when e.session_id = s_cur then 380000 else 350000 end, 'manual'
    from public.enrollments e
    join _seed_stu ss on ss.id = e.student_id and ss.transport
    join public.installments i on i.session_id = e.session_id;

  update public.student_charges sc
     set concession = round(sc.amount * ss.conc / 100)::bigint,
         note = case when ss.conc = 100 then 'RTE / free seat' when ss.conc = 50 then 'Staff ward' else 'Sibling concession' end
    from _seed_stu ss
   where ss.id = sc.student_id and ss.conc > 0 and sc.fee_head_id = h_tui;

  -- payments ------------------------------------------------------------------
  create temp table _seed_pay (student_id uuid, paid_on date, amount bigint, mode public.payment_mode) on commit drop;

  for srow in select ss.*, e.session_id, s.start_date
              from _seed_stu ss
              join public.enrollments e on e.student_id = ss.id
              join public.academic_sessions s on s.id = e.session_id
             order by s.start_date
  loop
    -- behaviour drifts a little between years
    v_prof := case when random() < 0.15 then profiles[1 + floor(random() * array_length(profiles, 1))::int] else srow.profile end;

    for ins in select i.* from public.installments i where i.session_id = srow.session_id order by i.number loop
      select coalesce(sum(net_amount), 0) into v_due
        from public.student_charges where student_id = srow.id and installment_id = ins.id;
      continue when v_due <= 0;

      if v_prof = 'early' then
        insert into _seed_pay values (srow.id, ins.due_date - floor(random() * 15)::int, v_due, modes[1 + floor(random() * 12)::int]);
      elsif v_prof = 'ontime' then
        insert into _seed_pay values (srow.id, ins.due_date + floor(random() * 10)::int, v_due, modes[1 + floor(random() * 12)::int]);
      elsif v_prof = 'late' then
        if random() < 0.85 then
          insert into _seed_pay values (srow.id, ins.due_date + 20 + floor(random() * 60)::int, v_due, modes[1 + floor(random() * 12)::int]);
        end if;
      elsif v_prof = 'partial' then
        v_frac := 0.4 + random() * 0.4;
        insert into _seed_pay values (srow.id, ins.due_date + floor(random() * 30)::int,
                                      (round(v_due * v_frac / 50000) * 50000)::bigint, modes[1 + floor(random() * 12)::int]);
        if random() < 0.5 then
          insert into _seed_pay values (srow.id, ins.due_date + 60 + floor(random() * 90)::int,
                                        (round(v_due * (1 - v_frac) / 50000) * 50000)::bigint, modes[1 + floor(random() * 12)::int]);
        end if;
      else -- defaulter
        if ins.number = 1 and random() < 0.6 then
          insert into _seed_pay values (srow.id, ins.due_date + 30 + floor(random() * 120)::int,
                                        (round(v_due * (0.2 + random() * 0.3) / 50000) * 50000)::bigint, 'cash');
        end if;
      end if;
    end loop;
  end loop;

  -- some arrears recovery in the running year from last year's defaulters / late payers
  insert into _seed_pay
  select ss.id, date '2026-04-15' + floor(random() * 150)::int, (round((5000 + random() * 15000) / 500) * 500 * 100)::bigint, 'cash'
    from _seed_stu ss
   where ss.profile in ('defaulter', 'partial') and random() < 0.35;

  delete from _seed_pay where paid_on > v_today or amount <= 0;

  insert into public.payments (receipt_no, student_id, session_id, paid_on, amount, mode, reference_no, source, created_at, created_by)
  select 'TMP-' || row_number() over (), sp.student_id, public.session_for_date(sp.paid_on), sp.paid_on, sp.amount, sp.mode,
         case sp.mode when 'upi' then 'UPI' || lpad(floor(random() * 1e9)::text, 10, '0')
                      when 'cheque' then 'CHQ ' || lpad(floor(random() * 999999)::text, 6, '0')
                      when 'bank_transfer' then 'NEFT' || lpad(floor(random() * 1e9)::text, 10, '0')
                      when 'card' then 'POS' || lpad(floor(random() * 99999)::text, 5, '0')
         end,
         case when sp.paid_on < date '2026-04-01' then 'import' else 'app' end,
         least(sp.paid_on::timestamp + interval '9 hours' + (floor(random() * 420) || ' minutes')::interval, now() - interval '5 minutes'),
         '11111111-1111-1111-1111-111111111111'
    from _seed_pay sp
   where public.session_for_date(sp.paid_on) is not null;

  -- receipt numbers in date order per session
  update public.payments p
     set receipt_no = 'SPS' || to_char(s.start_date, 'YY') || to_char(s.end_date, 'YY') || '/' || lpad(x.rn::text, 5, '0')
    from (select id, session_id, row_number() over (partition by session_id order by created_at, id) rn from public.payments) x
    join public.academic_sessions s on s.id = x.session_id
   where x.id = p.id;

  insert into public.receipt_counters (session_id, last_no)
  select session_id, count(*) from public.payments group by session_id;

  -- a few cancelled receipts in the running session (wrong student / bounced cheque)
  for pr in select * from public.payments where session_id = s_cur and paid_on < v_today - 10 order by created_at, id offset 40 limit 3 loop
    insert into public.payments (receipt_no, student_id, session_id, paid_on, amount, mode, reference_no, remarks,
                                 source, reverses_payment_id, created_at, created_by)
    values (pr.receipt_no || '-C', pr.student_id, pr.session_id, pr.paid_on + 2, -pr.amount, pr.mode, pr.reference_no,
            'Cancelled: ' || case when pr.mode = 'cheque' then 'cheque bounced' else 'entered against wrong student' end,
            'app', pr.id, least(pr.created_at + interval '2 days', now() - interval '1 minute'), '11111111-1111-1111-1111-111111111111');
  end loop;

  -- two students left mid-year: future installments waived
  update public.students set status = 'left', left_on = '2026-07-20'
   where id in (select e.student_id from public.enrollments e join public.students st on st.id = e.student_id
                 where e.session_id = s_cur and st.status = 'active' order by st.admission_no offset 57 limit 2);
  update public.student_charges sc set concession_before_waiver = sc.concession, concession = sc.amount, note = 'Waived: left on 20 Jul 2026'
    from public.installments i, public.students st
   where i.id = sc.installment_id and st.id = sc.student_id and st.status = 'left'
     and i.due_date > st.left_on;

  -- notes / promises for some defaulters
  insert into public.student_notes (student_id, note, promised_date, promised_amount, created_by, created_at)
  select ss.id,
         (array['Father called, will pay after salary on the 10th.',
                'Promised to clear Installment 1 dues this month.',
                'Requested fee concession, pending with principal.',
                'Phone not reachable. Sent reminder on WhatsApp.'])[1 + floor(random() * 4)::int],
         case when random() < 0.6 then v_today + floor(random() * 20)::int end,
         case when random() < 0.6 then (round((5000 + random() * 10000) / 500) * 500 * 100)::bigint end,
         '11111111-1111-1111-1111-111111111111',
         now() - (floor(random() * 30) || ' days')::interval
    from _seed_stu ss
   where ss.profile = 'defaulter' and random() < 0.5;

  insert into public.collection_targets (session_id, name, target_pct, target_date)
  values (s_cur, '90% of fees due by 31 December', 90, '2026-12-31');

  perform set_config('fees.skip_realloc', 'off', true);
  perform public.reallocate_all();
end $$;
