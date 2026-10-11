-- Row level security and the nightly consistency checks.  Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '88888888-8888-8888-8888-888888888888', 'authenticated', 'authenticated', 'pgtap-norole@school.test', '', now(), '{}', '{}', now(), now()),
       ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated', 'pgtap-admin2@school.test', '', now(), '{}', '{}', now(), now())
on conflict (id) do nothing;
update public.profiles set role = null where id = '88888888-8888-8888-8888-888888888888';
update public.profiles set role = 'admin' where id = '77777777-7777-7777-7777-777777777777';

-- anonymous
set local role anon;
select is((select count(*)::int from public.students), 0, 'anon sees no students');
select throws_ok($$ select public.dashboard(null) $$, '42501', null, 'anon cannot call analytics');
reset role;

-- signed in, but no role yet
select set_config('request.jwt.claims', '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.payments), 0, 'user without a role sees no payments');
select throws_ok($$ select public.search_students('a') $$, '42501', null, 'user without a role cannot search');
reset role;

-- admin
select set_config('request.jwt.claims', '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', true);
set local role authenticated;
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
