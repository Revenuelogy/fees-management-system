-- Privileges on internal helpers, last-admin protection, opening dues, withdraw/re-activate.
begin;
create extension if not exists pgtap with schema extensions;
-- the app's database role, set up the way grant_app_access() documents it
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'fees_api_test') then create role fees_api_test nologin; end if;
end $$;
select public.grant_app_access('fees_api_test');
select plan(10);

insert into public.app_users (id, email, password_hash)
values ('66666666-6666-6666-6666-666666666666', 'pgtap-admin3@school.test', 'x')
on conflict (id) do nothing;
update public.profiles set role = 'admin' where id = '66666666-6666-6666-6666-666666666666';
select set_config('app.user_id', '66666666-6666-6666-6666-666666666666', true);

-- fixtures (as owner)
create temp table fx (k text primary key, id uuid);
grant select on fx to fees_api_test;
insert into public.academic_sessions (name, start_date, end_date) values ('2081-82', '2081-04-01', '2082-03-31');
insert into fx select 's', id from public.academic_sessions where name = '2081-82';
insert into public.installments (session_id, number, name, due_date)
select id, n, 'I' || n, make_date(2081, case n when 1 then 4 else 8 end, 10) from fx, generate_series(1, 2) n where k = 's';
insert into public.fee_heads (name, priority) values ('PGTAP3 Tuition', 5);
insert into fx select 'h', id from public.fee_heads where name = 'PGTAP3 Tuition';
insert into public.students (admission_no, full_name) values ('PGTAP3-1', 'Hardening Child');
insert into fx select 'st', id from public.students where admission_no = 'PGTAP3-1';
insert into public.student_charges (student_id, session_id, installment_id, fee_head_id, amount, concession)
select (select id from fx where k = 'st'), i.session_id, i.id, (select id from fx where k = 'h'), 100000, 25000
  from public.installments i where i.session_id = (select id from fx where k = 's');

set local role fees_api_test;
select throws_ok($$ select public.reallocate_all() $$, '42501', null, 'reallocate_all is not callable through the API');
select throws_ok($$ select public.next_receipt_no((select id from fx where k = 's')) $$, '42501', null, 'next_receipt_no is not callable through the API');

-- opening due on a head that already has a structure/manual line is refused
select throws_ok($$ select public.add_opening_due((select id from fx where k = 'st'), (select id from fx where k = 's'), 5000, 'PGTAP3 Tuition') $$,
  'P0001', null, 'opening due will not merge into an existing fee line');
select lives_ok($$ select public.add_opening_due((select id from fx where k = 'st'), (select id from fx where k = 's'), 5000, 'PGTAP3 Old Dues') $$,
  'opening due on its own head is fine');

-- withdraw (installment 2 is after the leaving date) then re-activate restores the 25% concession
select is(public.withdraw_student((select id from fx where k = 'st'), '2081-05-01', true), 1, 'one future line waived');
select is(public.reactivate_student((select id from fx where k = 'st'), true), 1, 'one line restored');
select is((select concession from public.student_charges sc join public.installments i on i.id = sc.installment_id
            where sc.student_id = (select id from fx where k = 'st') and i.number = 2 and sc.fee_head_id = (select id from fx where k = 'h')),
  25000::bigint, 'the earlier concession is back, not zero');

-- a reversal timestamped before its original (same day) is still processed after it
reset role;
insert into public.payments (receipt_no, student_id, session_id, paid_on, amount, mode, source, created_at)
values ('PGTAP3-R1', (select id from fx where k = 'st'), (select id from fx where k = 's'), '2081-06-01', 30000, 'cash', 'import', now() + interval '1 hour');
insert into public.payments (receipt_no, student_id, session_id, paid_on, amount, mode, source, reverses_payment_id, created_at)
select 'PGTAP3-R1-C', student_id, session_id, paid_on, -amount, mode, 'app', id, now() from public.payments where receipt_no = 'PGTAP3-R1';
select is((select coalesce(sum(a.amount), 0)::bigint from public.allocations a join public.payments p on p.id = a.payment_id where p.receipt_no = 'PGTAP3-R1-C'),
  -30000::bigint, 'early-timestamped reversal still mirrors its original');
select is((select count(*)::int from public.payments p where p.student_id = (select id from fx where k = 'st')
            and p.amount <> coalesce((select sum(amount) from public.allocations a where a.payment_id = p.id), 0)), 0,
  'every payment of the student is fully allocated');

-- the last admin cannot be demoted
reset role;
update public.profiles set role = 'accountant' where role = 'admin' and id <> '66666666-6666-6666-6666-666666666666';
select throws_ok($$ update public.profiles set role = 'accountant' where id = '66666666-6666-6666-6666-666666666666' $$,
  'P0001', null, 'the school always keeps one admin');

select * from finish();
rollback;
