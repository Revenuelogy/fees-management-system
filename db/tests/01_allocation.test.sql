-- Allocation engine and payment rules.  Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;
-- the app's database role, set up the way grant_app_access() documents it
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'fees_api_test') then create role fees_api_test nologin; end if;
end $$;
select public.grant_app_access('fees_api_test');
select plan(24);

-- act as an admin (the local seed creates this user; create one if missing)
insert into public.app_users (id, email, password_hash)
values ('99999999-9999-9999-9999-999999999999', 'pgtap-admin@school.test', 'x')
on conflict (id) do nothing;
update public.profiles set role = 'admin' where id = '99999999-9999-9999-9999-999999999999';
select set_config('app.user_id', '99999999-9999-9999-9999-999999999999', true);

-- isolated fixtures in far-future sessions so they never collide with real data
create temp table fx (k text primary key, id uuid);
grant select on fx to fees_api_test;
insert into fx
select 's1', public.create_session('2091-92', '2091-04-01', '2092-03-31',
  '[{"number":1,"name":"I1","due_date":"2091-04-10"},{"number":2,"name":"I2","due_date":"2091-08-10"}]'::jsonb, false, null);
insert into fx
select 's2', public.create_session('2092-93', '2092-04-01', '2093-03-31',
  '[{"number":1,"name":"I1","due_date":"2092-04-10"},{"number":2,"name":"I2","due_date":"2092-08-10"}]'::jsonb, false, null);
insert into public.classes (name, sort_order) values ('PGTAP Class', 999);
insert into fx select 'c', id from public.classes where name = 'PGTAP Class';
insert into public.fee_heads (name, priority) values ('PGTAP Tuition', 1), ('PGTAP Bus', 2);
insert into fx select 'tui', id from public.fee_heads where name = 'PGTAP Tuition';
insert into fx select 'bus', id from public.fee_heads where name = 'PGTAP Bus';
insert into public.students (admission_no, full_name) values ('PGTAP-1', 'Test Child');
insert into fx select 'st', id from public.students where admission_no = 'PGTAP-1';

-- fee structure: tuition 1000 + bus 500 per installment, both sessions
insert into public.fee_structures (class_id, installment_id, fee_head_id, amount)
select (select id from fx where k = 'c'), i.id, h.id, case when h.id = (select id from fx where k = 'tui') then 100000 else 50000 end
  from public.installments i
  cross join (select id from fx where k in ('tui', 'bus')) h
 where i.session_id in (select id from fx where k in ('s1', 's2'));

select lives_ok($$ select public.enroll_student((select id from fx where k='st'), (select id from fx where k='s1'), (select id from fx where k='c'), 'A', '1', true) $$,
  'enrol + generate charges for session 1');
select is((select count(*)::int from public.student_charges where student_id = (select id from fx where k='st')), 4, '4 charges generated');
select lives_ok($$ select public.enroll_student((select id from fx where k='st'), (select id from fx where k='s2'), (select id from fx where k='c'), 'A', '1', true) $$,
  'enrol in session 2');
select is((select sum(net_amount)::bigint from public.student_charges where student_id = (select id from fx where k='st')), 600000::bigint, 'expected 6000 rupees over two sessions');

-- payments dated in the future are refused, so fake "today" is not possible here;
-- insert payments directly as the table owner with paid_on inside session 2 (bypasses collect_payment date check)
reset role;
insert into public.payments (receipt_no, student_id, session_id, paid_on, amount, mode, source)
values ('PGTAP-R1', (select id from fx where k='st'), (select id from fx where k='s2'), '2092-05-01', 200000, 'cash', 'import');

-- oldest first: 2000 clears session-1 installment 1 (1500) then 500 of installment 2 tuition
select is((select sum(a.amount)::bigint from public.allocations a join public.payments p on p.id = a.payment_id where p.receipt_no = 'PGTAP-R1'), 200000::bigint, 'payment fully allocated');
select is((select sum(a.amount)::bigint from public.allocations a join public.payments p on p.id = a.payment_id
            where p.receipt_no = 'PGTAP-R1' and a.kind = 'arrears'), 200000::bigint, 'all of it went to previous-session dues');
select is((select count(*)::int from public.allocations a join public.payments p on p.id = a.payment_id
            join public.installments i on i.id = a.installment_id
            where p.receipt_no = 'PGTAP-R1' and i.number = 1), 2, 'installment 1 fully cleared first (tuition + bus)');
select ok((select bool_and(is_inferred) from public.allocations a join public.payments p on p.id = a.payment_id where p.receipt_no = 'PGTAP-R1'),
  'imported receipt without hints is marked inferred');

-- hint: a receipt that names the fee head wins over the default rule
insert into public.payments (receipt_no, student_id, session_id, paid_on, amount, mode, source, fee_head_hint_id, session_hint_id)
values ('PGTAP-R2', (select id from fx where k='st'), (select id from fx where k='s2'), '2092-05-02', 50000, 'cash', 'import',
        (select id from fx where k='bus'), (select id from fx where k='s2'));
select is((select max(fh.name) from public.allocations a join public.payments p on p.id = a.payment_id join public.fee_heads fh on fh.id = a.fee_head_id
            where p.receipt_no = 'PGTAP-R2'), 'PGTAP Bus', 'hinted fee head used');
select is((select max(a.kind::text) from public.allocations a join public.payments p on p.id = a.payment_id where p.receipt_no = 'PGTAP-R2'),
  'current', 'hinted session is the running session -> current');
select ok((select bool_and(not is_inferred) from public.allocations a join public.payments p on p.id = a.payment_id where p.receipt_no = 'PGTAP-R2'),
  'hinted allocation is not inferred');

-- explicit target: pay session-2 installment 2 tuition directly
insert into public.payments (receipt_no, student_id, session_id, paid_on, amount, mode, source)
values ('PGTAP-R3', (select id from fx where k='st'), (select id from fx where k='s2'), '2092-05-03', 120000, 'upi', 'app');
insert into public.payment_targets (payment_id, charge_id, amount)
select p.id, sc.id, 100000
  from public.payments p, public.student_charges sc join public.installments i on i.id = sc.installment_id
 where p.receipt_no = 'PGTAP-R3' and sc.student_id = (select id from fx where k='st')
   and sc.session_id = (select id from fx where k='s2') and i.number = 2 and sc.fee_head_id = (select id from fx where k='tui');
select is((select a.amount from public.allocations a join public.payments p on p.id = a.payment_id join public.installments i on i.id = a.installment_id
            where p.receipt_no = 'PGTAP-R3' and i.number = 2 and a.session_id = (select id from fx where k='s2') and a.fee_head_id = (select id from fx where k='tui')),
  100000::bigint, 'explicit target honoured');
select is((select sum(a.amount)::bigint from public.allocations a join public.payments p on p.id = a.payment_id where p.receipt_no = 'PGTAP-R3' and a.kind = 'arrears'),
  20000::bigint, 'remainder of a targeted payment follows the default rule (oldest dues)');

-- overpayment -> advance
insert into public.payments (receipt_no, student_id, session_id, paid_on, amount, mode, source)
values ('PGTAP-R4', (select id from fx where k='st'), (select id from fx where k='s2'), '2092-06-01', 1000000, 'cash', 'app');
select is((select sum(amount)::bigint from public.allocations where student_id = (select id from fx where k='st') and charge_id is null),
  1000000::bigint + 200000 + 50000 + 120000 - 600000, 'money beyond all dues is held as advance');
select is((select count(*)::int from public.student_charges sc where sc.student_id = (select id from fx where k='st')
            and sc.net_amount > coalesce((select sum(amount) from public.allocations a where a.charge_id = sc.id), 0)), 0, 'every charge is now paid');

-- reversal re-opens dues
select set_config('app.user_id', '99999999-9999-9999-9999-999999999999', true);
insert into public.payments (receipt_no, student_id, session_id, paid_on, amount, mode, source, reverses_payment_id)
select 'PGTAP-R4-C', student_id, session_id, '2092-06-05', -amount, mode, 'app', id from public.payments where receipt_no = 'PGTAP-R4';
select is((select sum(a.amount)::bigint from public.allocations a join public.payments p on p.id = a.payment_id where p.receipt_no = 'PGTAP-R4-C'),
  -1000000::bigint, 'reversal mirrors the original allocation');
select is((select coalesce(sum(amount), 0)::bigint from public.allocations where student_id = (select id from fx where k='st') and charge_id is null), 0::bigint,
  'advance disappears after cancelling the overpayment');
select is((select sum(sc.net_amount - coalesce((select sum(amount) from public.allocations a where a.charge_id = sc.id), 0))::bigint
             from public.student_charges sc where sc.student_id = (select id from fx where k='st')),
  600000::bigint - 370000, 'dues re-opened by the cancellation');

-- concession change re-runs allocation automatically (statement trigger)
update public.student_charges set concession = amount
 where student_id = (select id from fx where k='st') and session_id = (select id from fx where k='s1');
select is((select coalesce(sum(amount), 0)::bigint from public.allocations where student_id = (select id from fx where k='st') and kind = 'arrears'),
  0::bigint, 'waiving session 1 moves money off it');
select is((select sum(amount)::bigint from public.allocations where student_id = (select id from fx where k='st')),
  370000::bigint, 'total allocated still equals net money received');

-- current-first rule
update public.school_settings set allocation_order = 'current_first' where id = 1;
update public.student_charges set concession = 0
 where student_id = (select id from fx where k='st') and session_id = (select id from fx where k='s1');
select ok((select bool_and(a.kind <> 'arrears') from public.allocations a join public.payments p on p.id = a.payment_id where p.receipt_no = 'PGTAP-R1'),
  'current_first: the first payment now goes to the running session');
update public.school_settings set allocation_order = 'oldest_first' where id = 1;
select is((select sum(a.amount)::bigint from public.allocations a join public.payments p on p.id = a.payment_id where p.receipt_no = 'PGTAP-R1' and a.kind = 'arrears'),
  200000::bigint, 'switching back restores oldest-first');

-- closed month blocks back-dated payments
insert into public.monthly_snapshots (month, session_id, data) values ('2092-07-01', (select id from fx where k='s2'), '{}');
select throws_ok($$ insert into public.payments (receipt_no, student_id, session_id, paid_on, amount, mode)
                     values ('PGTAP-R5', (select id from fx where k='st'), (select id from fx where k='s2'), '2092-07-15', 100, 'cash') $$,
  'P0001', null, 'payments dated in a closed month are refused');

-- collect_payment validation through the RPC as the signed-in admin
set local role fees_api_test;
select throws_ok($$ select public.collect_payment((select id from fx where k='st'), 0, current_date, 'cash') $$,
  'P0001', 'Amount must be greater than zero', 'zero amount refused');

select * from finish();
rollback;
