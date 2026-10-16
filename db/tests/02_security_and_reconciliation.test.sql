-- Row level security and the nightly consistency checks.  Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;
-- the app's database role, set up the way grant_app_access() documents it
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'fees_api_test') then create role fees_api_test nologin; end if;
end $$;
select public.grant_app_access('fees_api_test');
select plan(8);

insert into public.app_users (id, email, password_hash)
values ('88888888-8888-8888-8888-888888888888', 'pgtap-norole@school.test', 'x'),
       ('77777777-7777-7777-7777-777777777777', 'pgtap-admin2@school.test', 'x')
on conflict (id) do nothing;
update public.profiles set role = null where id = '88888888-8888-8888-8888-888888888888';
update public.profiles set role = 'admin' where id = '77777777-7777-7777-7777-777777777777';

-- no signed-in user
set local role fees_api_test;
select is((select count(*)::int from public.students), 0, 'without a user nobody sees students');
select throws_ok($$ select public.dashboard(null) $$, '42501', null, 'without a user nobody can call analytics');
reset role;

-- signed in, but no role yet
select set_config('app.user_id', '88888888-8888-8888-8888-888888888888', true);
set local role fees_api_test;
select is((select count(*)::int from public.payments), 0, 'user without a role sees no payments');
select throws_ok($$ select public.search_students('a') $$, '42501', null, 'user without a role cannot search');
reset role;

-- admin
select set_config('app.user_id', '77777777-7777-7777-7777-777777777777', true);
set local role fees_api_test;
select throws_ok($$ insert into public.payments (receipt_no, student_id, session_id, paid_on, amount)
                     select 'X', s.id, a.id, a.start_date, 100 from public.students s, public.academic_sessions a limit 1 $$,
  '42501', null, 'even admins cannot insert payments directly (only via collect_payment)');
update public.payments set amount = 1;
select is((select count(*)::int from public.payments where amount = 1), 0, 'payments are append-only (updates change nothing)');

-- every consistency check passes on whatever data is loaded
select is((select count(*)::int
             from public.academic_sessions s,
                  jsonb_array_elements(public.reconciliation(s.id) -> 'checks') c
            where not (c ->> 'ok')::boolean and coalesce((c ->> 'warning')::boolean, false) = false),
  0, 'no failing reconciliation checks in any session');
select is((select count(*)::int from public.payments p
            where p.amount <> coalesce((select sum(amount) from public.allocations a where a.payment_id = p.id), 0)),
  0, 'every payment is fully allocated');

select * from finish();
rollback;
