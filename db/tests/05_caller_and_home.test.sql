-- The Caller role (reads every family, writes only calls, notes and activity responses, never money or school
-- figures), the Home figures, the money and call summaries, and giving a family to a caller.  Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;
-- the app's database role, set up the way grant_app_access() documents it
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'fees_api_test') then create role fees_api_test nologin; end if;
end $$;
select public.grant_app_access('fees_api_test');
select plan(40);

insert into public.app_users (id, email, password_hash)
values ('66666666-6666-6666-6666-666666666601', 'pgtap-caller5@school.test', 'x'),
       ('66666666-6666-6666-6666-666666666602', 'pgtap-principal5@school.test', 'x'),
       ('66666666-6666-6666-6666-666666666603', 'pgtap-admin5@school.test', 'x'),
       ('66666666-6666-6666-6666-666666666604', 'pgtap-teacher5@school.test', 'x')
on conflict (id) do nothing;
update public.profiles set role = 'caller' where id = '66666666-6666-6666-6666-666666666601';
update public.profiles set role = 'principal' where id = '66666666-6666-6666-6666-666666666602';
update public.profiles set role = 'admin' where id = '66666666-6666-6666-6666-666666666603';
update public.profiles set role = 'teacher' where id = '66666666-6666-6666-6666-666666666604';

-- fixtures (as owner): one family with a student, a payment and an activity the student takes part in
create temp table fx (k text primary key, id uuid);
grant select on fx to fees_api_test;
insert into public.students (admission_no, full_name, father_name, phone) values ('PGTAP5-1', 'Kiran Five', 'Mohan Five', '9000500001');
insert into fx select 'st', id from public.students where admission_no = 'PGTAP5-1';
insert into fx select 'p', parent_id from public.students where admission_no = 'PGTAP5-1';
-- a family with nothing to recover: never on the day's list by the rules
insert into public.students (admission_no, full_name, father_name, phone) values ('PGTAP5-2', 'Lata Six', 'Gopal Six', '9000500002');
insert into fx select 'p2', parent_id from public.students where admission_no = 'PGTAP5-2';
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
select throws_ok($$ select public.home_fees((select id from public.academic_sessions where is_current)) $$, '42501', null, 'a caller cannot see the Home fee figures');
select throws_ok($$ select public.home_today() $$, '42501', null, 'a caller cannot see today''s school figures');
select throws_ok($$ select public.recovery_summary(public.fees_today() - 6, public.fees_today()) $$, '42501', null,
  'a caller cannot see the money received');
select throws_ok($$ select public.call_analytics(public.fees_today() - 6, public.fees_today()) $$, '42501', null,
  'a caller cannot see the call analytics');
select throws_ok($$ select public.assign_call((select id from fx where k = 'p2'), '66666666-6666-6666-6666-666666666601') $$,
  '42501', null, 'a caller cannot give families to callers');
select throws_ok($$ select public.home_classes((select id from public.academic_sessions where is_current)) $$, '42501', null, 'a caller cannot see the class figures');
select throws_ok($$ select public.fee_position((select id from public.academic_sessions where is_current)) $$, '42501', null, 'a caller cannot see the fee totals');
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
select is((select count(*)::int
             from (select public.fee_position((select id from public.academic_sessions where is_current)) f
                   union all select public.fee_position((select id from public.academic_sessions where is_current), c.id) from public.classes c) x
            where (f ->> 'total_fee_all')::bigint - (f ->> 'received_all')::bigint <> (f ->> 'balance_all')::bigint
               or (f ->> 'to_recover')::bigint <> (f ->> 'due_now')::bigint + (f ->> 'old_balance')::bigint
               or (f ->> 'balance')::bigint <> (f ->> 'due_now')::bigint + (f ->> 'due_later')::bigint
               or (f ->> 'total_fee_all')::bigint <> (f ->> 'total_fee')::bigint + (f ->> 'old_opening')::bigint), 0,
  'fee position, for the school and every class: total incl. previous years - received = remaining, and the parts add up');
select is((select coalesce(sum((public.fee_position((select id from public.academic_sessions where is_current), c.id) ->> 'total_fee')::bigint), 0)::bigint from public.classes c),
          (select coalesce(sum(b.expected), 0)::bigint from public.student_balances((select id from public.academic_sessions where is_current)) b where b.class_id is not null),
  'the classes'' total fees add up to the total fees of the students enrolled');
select is((select (m -> 'by_source' -> 'calls' ->> 'amount')::bigint + (m -> 'by_source' -> 'activities' ->> 'amount')::bigint
                  + (m -> 'by_source' -> 'direct' ->> 'amount')::bigint - (m ->> 'received')::bigint
             from (select public.recovery_summary(public.fees_today() - 29, public.fees_today()) -> 'money' as m) x), 0::bigint,
  'money from calls, activities and families on their own adds up to the money received');
select is((select coalesce(sum((c ->> 'calls')::int), 0)
             from jsonb_array_elements(public.call_analytics(public.fees_today() - 29, public.fees_today()) -> 'calls' -> 'by_caller') c)::bigint,
          (select count(*) from public.parent_calls where call_date between public.fees_today() - 29 and public.fees_today() and created_by is not null),
  'call analytics: every call of the period is counted for the person who made it');

-- giving a family to a caller
select lives_ok($$ select public.assign_call((select id from fx where k = 'p2'), '66666666-6666-6666-6666-666666666601', null, 'Ask about the bus') $$,
  'the principal gives a family the rules leave off the list to a caller, for today');
select throws_ok($$ select public.assign_call((select id from fx where k = 'p2'), '66666666-6666-6666-6666-666666666601', public.fees_today() - 1) $$,
  'P0001', 'Choose today or a later day', 'not for a day that has gone');
select throws_ok($$ select public.assign_call((select id from fx where k = 'p2'), '66666666-6666-6666-6666-666666666604') $$,
  'P0001', 'Choose a staff member who makes calls', 'only to someone who makes calls');
select lives_ok($$ select public.assign_call((select id from fx where k = 'p2'), '66666666-6666-6666-6666-666666666601', public.fees_today() + 3, 'Follow up') $$,
  'or for a later day');
select is((select count(*)::int from jsonb_array_elements(public.call_assignments_on(public.fees_today() + 3) -> 'rows') r
            where r ->> 'parent_id' = (select id::text from fx where k = 'p2') and r ->> 'note' = 'Follow up'), 1,
  'that day''s list shows it with the note');
reset role;

-- the caller sees it to call today, given by the principal, and can take it off their list
select set_config('app.user_id', '66666666-6666-6666-6666-666666666601', true);
set local role fees_api_test;
select is((select (r ->> 'state') || '|' || (r -> 'reasons' ->> 0) || '|' || (r ->> 'assigned_by_name') || '|' || (r ->> 'assign_note')
             from jsonb_array_elements(public.call_board() -> 'rows') r where r ->> 'parent_id' = (select id::text from fx where k = 'p2')),
  'due|assigned|pgtap-principal5|Ask about the bus', 'the caller has it to call today, given by the principal with the note');
select is(public.unassign_call((select id from fx where k = 'p2')), 1, 'the caller can take it off their list');
reset role;

-- an admin who takes over a family given to a caller makes it their own
select set_config('app.user_id', '66666666-6666-6666-6666-666666666602', true);
select public.assign_call((select id from fx where k = 'p2'), '66666666-6666-6666-6666-666666666601');
select set_config('app.user_id', '66666666-6666-6666-6666-666666666603', true);
select public.take_call((select id from fx where k = 'p2'));
select is((select (assigned_to = assigned_by and assign_note is null and not 'assigned' = any (reasons))::text
             from public.call_list() where parent_id = (select id from fx where k = 'p2')),
  'true', 'a family taken over is the taker''s own: no longer "given" and no note');

-- a teacher (no fee access) sees no family either
select set_config('app.user_id', '66666666-6666-6666-6666-666666666601', true);
update public.profiles set role = 'teacher' where id = '66666666-6666-6666-6666-666666666601';
set local role fees_api_test;
select throws_ok($$ select * from public.search_families('Five') $$, '42501', null, 'a teacher cannot search families');
reset role;

select * from finish();
rollback;
