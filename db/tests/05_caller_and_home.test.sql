-- The Caller role (reads every family, writes only calls, notes and activity responses, never money or school
-- figures) and the Home figures.  Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;
-- the app's database role, set up the way grant_app_access() documents it
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'fees_api_test') then create role fees_api_test nologin; end if;
end $$;
select public.grant_app_access('fees_api_test');
select plan(27);

insert into public.app_users (id, email, password_hash)
values ('66666666-6666-6666-6666-666666666601', 'pgtap-caller5@school.test', 'x'),
       ('66666666-6666-6666-6666-666666666602', 'pgtap-principal5@school.test', 'x'),
       ('66666666-6666-6666-6666-666666666603', 'pgtap-admin5@school.test', 'x')
on conflict (id) do nothing;
update public.profiles set role = 'caller' where id = '66666666-6666-6666-6666-666666666601';
update public.profiles set role = 'principal' where id = '66666666-6666-6666-6666-666666666602';
update public.profiles set role = 'admin' where id = '66666666-6666-6666-6666-666666666603';

-- fixtures (as owner): one family with a student, a payment and an activity the student takes part in
create temp table fx (k text primary key, id uuid);
grant select on fx to fees_api_test;
insert into public.students (admission_no, full_name, father_name, phone) values ('PGTAP5-1', 'Kiran Five', 'Mohan Five', '9000500001');
insert into fx select 'st', id from public.students where admission_no = 'PGTAP5-1';
insert into fx select 'p', parent_id from public.students where admission_no = 'PGTAP5-1';
insert into public.recovery_activities (name, start_date) values ('PGTAP5 activity', public.fees_today());
insert into fx select 'a', id from public.recovery_activities where name = 'PGTAP5 activity';
insert into public.recovery_participants (activity_id, student_id, added_on)
select (select id from fx where k = 'a'), (select id from fx where k = 'st'), public.fees_today();
insert into fx select 'rp', id from public.recovery_participants where activity_id = (select id from fx where k = 'a');

-- the caller ---------------------------------------------------------------------------------------------
select set_config('app.user_id', '66666666-6666-6666-6666-666666666601', true);
set local role fees_api_test;
select ok(public.is_staff() and not public.can_write() and not public.sees_school(),
  'a caller reads like staff, but neither writes fee data nor sees school figures');
select is((select count(*)::int from public.students where admission_no = 'PGTAP5-1'), 1, 'a caller sees the students');
select is((select count(*)::int from public.parents where id = (select id from fx where k = 'p')), 1, 'a caller sees the families');
select ok(jsonb_typeof(public.student_360((select id from fx where k = 'st'))) = 'object', 'a caller opens a student''s full profile');
select ok(exists (select 1 from public.search_families('Five') where parent_id = (select id from fx where k = 'p')),
  'a caller finds a family by a child''s name');
select ok(exists (select 1 from public.search_families('00500001') where parent_id = (select id from fx where k = 'p')),
  'a caller finds a family by phone');
select ok(jsonb_typeof(public.open_promises() -> 'promises') = 'array', 'a caller lists the open promises');

-- what a caller may write
select lives_ok($$ select public.take_call((select id from fx where k = 'p')) $$, 'a caller takes a family into their list');
select is((select assigned_to from public.call_assignments where call_date = public.fees_today() and parent_id = (select id from fx where k = 'p')),
  '66666666-6666-6666-6666-666666666601'::uuid, 'the family is on the caller''s list');
select lives_ok($$ select public.log_parent_call((select id from fx where k = 'p'), 'connected', 'fees', public.fees_today(), 'father',
                                                 'will_pay', 'Will pay on Saturday.', public.fees_today() + 3, 500000, null) $$,
  'a caller logs a call with a promise');
select is((select created_by from public.parent_calls where parent_id = (select id from fx where k = 'p')),
  '66666666-6666-6666-6666-666666666601'::uuid, 'the call keeps the caller''s name');
select lives_ok($$ insert into public.student_notes (student_id, note) values ((select id from fx where k = 'st'), 'Mother asked for a call after 6 pm.') $$,
  'a caller adds a note on a student');
select lives_ok($$ select public.set_participant_response((select id from fx where k = 'rp'), 'positive', 'Will deposit this week.') $$,
  'a caller records a family''s response to an activity');
select is((select response from public.recovery_participants where id = (select id from fx where k = 'rp')), 'positive', 'the response is saved');

-- what a caller may not do
select throws_ok($$ select public.collect_payment((select id from fx where k = 'st'), 100000, public.fees_today(), 'cash', null, null, null) $$,
  '42501', null, 'a caller cannot collect fees');
select throws_ok($$ select public.cancel_payment((select id from public.payments limit 1), 'test') $$,
  '42501', null, 'a caller cannot cancel a receipt');
update public.students set full_name = 'Changed' where admission_no = 'PGTAP5-1';
select is((select full_name from public.students where admission_no = 'PGTAP5-1'), 'Kiran Five', 'a caller cannot edit a student');
update public.parents set name = 'Changed' where id = (select id from fx where k = 'p');
select is((select name from public.parents where id = (select id from fx where k = 'p')), 'Mohan Five', 'a caller cannot edit a parent');
delete from public.student_notes where student_id = (select id from fx where k = 'st');
select is((select count(*)::int from public.student_notes where student_id = (select id from fx where k = 'st')), 1, 'a caller cannot delete notes');
select throws_ok($$ select public.home_fees(public.running_session()) $$, '42501', null, 'a caller cannot see the Home fee figures');
select throws_ok($$ select public.home_today() $$, '42501', null, 'a caller cannot see today''s school figures');
select throws_ok($$ select public.home_chase() $$, '42501', null, 'a caller cannot see Chase first');
select throws_ok($$ select public.home_classes(public.running_session()) $$, '42501', null, 'a caller cannot see the class figures');
reset role;

-- Home, as the principal ---------------------------------------------------------------------------------
select set_config('app.user_id', '66666666-6666-6666-6666-666666666602', true);
set local role fees_api_test;
select ok((select (f ->> 'to_recover')::bigint = (f ->> 'due_now')::bigint + (f ->> 'old_balance')::bigint
             and (f ->> 'balance')::bigint = (f ->> 'due_now')::bigint + (f ->> 'due_later')::bigint
             and (f ->> 'received')::bigint + (f ->> 'balance')::bigint = (f ->> 'total_fee')::bigint
             from public.academic_sessions s, lateral (select public.home_fees(s.id) f) x
            order by s.start_date desc limit 1),
  'Home: To recover now = Due now + Old balance, Balance = Due now + Due later, Received + Balance = Total fee');
select is((select jsonb_agg(r ->> 'parent_id' order by (r ->> 'rank')::int) from jsonb_array_elements(public.home_chase() -> 'rows') r),
          (select jsonb_agg(x.parent_id::text order by x.rank)
             from (select r ->> 'parent_id' as parent_id, (r ->> 'rank')::int as rank
                     from jsonb_array_elements(public.call_board() -> 'rows') r
                    where r ->> 'state' = 'due' order by (r ->> 'rank')::int limit 5) x),
  'Chase first is the first five families of the Calls page, in the same order');
select is((select count(*)::int from jsonb_array_elements(public.home_chase() -> 'rows')),
          least(5, (select count(*)::int from jsonb_array_elements(public.call_board() -> 'rows') r where r ->> 'state' = 'due')),
  'Chase first shows at most five families');
reset role;

-- a teacher (no fee access) sees no family either
select set_config('app.user_id', '66666666-6666-6666-6666-666666666601', true);
update public.profiles set role = 'teacher' where id = '66666666-6666-6666-6666-666666666601';
set local role fees_api_test;
select throws_ok($$ select * from public.search_families('Five') $$, '42501', null, 'a teacher cannot search families');
reset role;

select * from finish();
rollback;
