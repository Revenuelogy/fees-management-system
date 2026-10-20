-- Parent profiles linked by phone, promises, the call list and recovery activities.  Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;
-- the app's database role, set up the way grant_app_access() documents it
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'fees_api_test') then create role fees_api_test nologin; end if;
end $$;
select public.grant_app_access('fees_api_test');
select plan(38);

insert into public.app_users (id, email, password_hash)
values ('55555555-5555-5555-5555-555555555555', 'pgtap-admin4@school.test', 'x'),
       ('44444444-4444-4444-4444-444444444444', 'pgtap-principal4@school.test', 'x')
on conflict (id) do nothing;
update public.profiles set role = 'admin' where id = '55555555-5555-5555-5555-555555555555';
update public.profiles set role = 'principal' where id = '44444444-4444-4444-4444-444444444444';
select set_config('app.user_id', '55555555-5555-5555-5555-555555555555', true);
update public.school_settings set promise_grace_days = 1 where id = 1;

-- fixtures (as owner): a session covering the last few weeks (the running one, or a new one) with an
-- installment already due; five students in four families
create temp table fx (k text primary key, id uuid);
grant select on fx to fees_api_test;
insert into fx
select 's', coalesce(public.session_for_date(public.fees_today() - 20),
                     public.create_session('PGTAP4', public.fees_today() - 200, public.fees_today() + 160,
                       jsonb_build_array(jsonb_build_object('number', 1, 'name', 'I1', 'due_date', public.fees_today() - 30)), true, null));
insert into fx select 'i', id from public.installments
 where session_id = (select id from fx where k = 's') and due_date <= public.fees_today() - 5 order by due_date desc limit 1;
insert into public.fee_heads (name, priority) values ('PGTAP4 Fee', 3);
insert into fx select 'h', id from public.fee_heads where name = 'PGTAP4 Fee';

insert into public.students (admission_no, full_name, father_name, phone) values
  ('PGTAP4-1', 'Asha One', 'Ravi One', '+91 90000 11111'),
  ('PGTAP4-2', 'Bina One', 'Ravi One', '090000-11111'),
  ('PGTAP4-3', 'Chetan Two', 'Mohan Two', '9000022222'),
  ('PGTAP4-4', 'Dev Three', null, '9000033333'),
  ('PGTAP4-5', 'Esha Four', 'Arun Four', '9000044444'),
  ('PGTAP4-6', 'Farid Five', 'Kamal Five', '9000055555');
insert into fx select 'st' || right(admission_no, 1), id from public.students where admission_no like 'PGTAP4-%';
insert into fx select 'pA', parent_id from public.students where admission_no = 'PGTAP4-1';
insert into fx select 'pB', parent_id from public.students where admission_no = 'PGTAP4-3';
insert into fx select 'pC', parent_id from public.students where admission_no = 'PGTAP4-4';
insert into fx select 'pD', parent_id from public.students where admission_no = 'PGTAP4-5';

-- ₹1,000 due on the installment for each of the first five
insert into public.student_charges (student_id, session_id, installment_id, fee_head_id, amount, source)
select st.id, (select id from fx where k = 's'), (select id from fx where k = 'i'), (select id from fx where k = 'h'), 100000, 'manual'
  from public.students st where st.admission_no in ('PGTAP4-1', 'PGTAP4-2', 'PGTAP4-3', 'PGTAP4-4', 'PGTAP4-5');

-- phone numbers and families -------------------------------------------------------------
select is(public.normalize_phone('+91 98765-43210'), '9876543210', '+91 is dropped');
select is(public.normalize_phone('098765 43210'), '9876543210', 'a leading 0 is dropped');
select is(public.normalize_phone('n/a'), null, 'text that is not a phone number gives no family');
select is((select parent_id from public.students where admission_no = 'PGTAP4-2'), (select id from fx where k = 'pA'),
  'brother and sister with the same number (written differently) share one parent');
select is((select name || '|' || relation || '|' || phone from public.parents where id = (select id from fx where k = 'pA')),
  'Ravi One|father|9000011111', 'the profile is named after the father and keeps the digits of the number');
select is((select relation from public.parents where id = (select id from fx where k = 'pC')), 'guardian',
  'no parent names: a guardian profile');

update public.students set phone = '9000066666' where admission_no = 'PGTAP4-6';
select ok((select p.phone = '9000066666' from public.students st join public.parents p on p.id = st.parent_id where st.admission_no = 'PGTAP4-6'),
  'a new phone number moves the student to that number''s family');
update public.students set parent_id = (select id from fx where k = 'pA') where admission_no = 'PGTAP4-6';
update public.students set full_name = 'Farid Five K', phone = '+91 9000066666' where admission_no = 'PGTAP4-6';
select is((select parent_id from public.students where admission_no = 'PGTAP4-6'), (select id from fx where k = 'pA'),
  'a student moved by hand stays in that family when the same number is re-typed');
update public.students set parent_id = null where admission_no = 'PGTAP4-6';

-- family balances add up ---------------------------------------------------------------
select is((select sum(f.total_pending)::bigint from public.parent_balances((select id from fx where k = 's')) f
            where f.parent_id in (select id from fx where k like 'p_')),
          (select sum(b.total_pending)::bigint from public.student_balances((select id from fx where k = 's')) b
            where b.student_id in (select id from fx where k in ('st1', 'st2', 'st3', 'st4', 'st5'))),
  'family pending = the sum of the children''s pending');
select is((select children from public.parent_balances((select id from fx where k = 's')) f where f.parent_id = (select id from fx where k = 'pA')),
  2, 'family A has two children');

-- promises -------------------------------------------------------------------------------
-- calls 10 days ago, promising to pay 5 days ago (deadline 4 days ago with one grace day)
insert into public.recovery_campaigns (id, kind, name, start_date, silent_days, high_due, include_old_dues, include_broken, recall_days)
values ('c4c4c4c4-0000-0000-0000-000000000001', 'calls', 'PGTAP4 broken only', public.fees_today() - 15, null, null, false, true, 7),
       ('c4c4c4c4-0000-0000-0000-000000000002', 'calls', 'PGTAP4 everyone owing', public.fees_today() - 15, null, 100, false, false, 7);
insert into fx values ('c1', 'c4c4c4c4-0000-0000-0000-000000000001'), ('c2', 'c4c4c4c4-0000-0000-0000-000000000002');
insert into public.parent_calls (parent_id, campaign_id, call_date, outcome, picked_by, response, promised_date, promised_amount)
select id, 'c4c4c4c4-0000-0000-0000-000000000001', public.fees_today() - 10, 'connected', 'father', 'will_pay', public.fees_today() - 5,
       case when k = 'pC' then 100000 end
  from fx where k in ('pA', 'pB', 'pC', 'pD');

-- A: a sibling paid before the date (kept early); B: nothing (broken); C: part of the promised ₹1,000 (partly kept);
-- D: paid the day after the date (kept within the grace day)
insert into public.payments (receipt_no, student_id, session_id, paid_on, amount, mode, source) values
  ('PGTAP4-R1', (select id from fx where k = 'st2'), (select id from fx where k = 's'), public.fees_today() - 6, 50000, 'cash', 'import'),
  ('PGTAP4-R2', (select id from fx where k = 'st4'), (select id from fx where k = 's'), public.fees_today() - 7, 30000, 'cash', 'import'),
  ('PGTAP4-R3', (select id from fx where k = 'st5'), (select id from fx where k = 's'), public.fees_today() - 4, 20000, 'cash', 'import');

select is((select status || '/' || timing from public.parent_promises((select id from fx where k = 'pA'))), 'kept/early',
  'paid by a brother or sister before the promised date: kept early');
select is((select status from public.parent_promises((select id from fx where k = 'pB'))), 'broken', 'nothing paid by the deadline: broken');
select is((select status || '/' || paid from public.parent_promises((select id from fx where k = 'pC'))), 'partial/30000',
  'less than the promised amount: partly kept');
select is((select status || '/' || timing from public.parent_promises((select id from fx where k = 'pD'))), 'kept/grace',
  'paid on the grace day: kept');

-- the call list ------------------------------------------------------------------------
select is((select state from public.call_queue(array[(select id from fx where k = 'c1')]) q where q.parent_id = (select id from fx where k = 'pB')),
  'due', 'a broken promise is back on the call list the day after its deadline');
select ok((select 'broken_promise' = any (q.reasons) from public.call_queue(array[(select id from fx where k = 'c1')]) q
            where q.parent_id = (select id from fx where k = 'pB')), 'with the reason "broken promise"');
select ok((select 'partial_promise' = any (q.reasons) and q.state = 'due' from public.call_queue(array[(select id from fx where k = 'c1')]) q
            where q.parent_id = (select id from fx where k = 'pC')), 'a partly kept promise is called again too');
select is((select state from public.call_queue(array[(select id from fx where k = 'c1')]) q where q.parent_id = (select id from fx where k = 'pA')),
  'off_list', 'a kept promise takes the family off the list');
select ok((select count(*) = 0 from public.call_queue(array[(select id from fx where k = 'c1')]) q
            where q.parent_id = (select id from fx where k = 'pB') and q.state = 'due' and q.priority < 40), 'broken promises come first');
select public.log_parent_call((select id from fx where k = 'pC'), 'no_answer', (select id from fx where k = 'c1'));
select is((select q.state || '/' || (q.next_call_on - public.fees_today()) from public.call_queue(array[(select id from fx where k = 'c1')]) q
            where q.parent_id = (select id from fx where k = 'pC')), 'waiting/1',
  'after a broken promise, an unanswered follow-up call is tried again the next day');

-- staff log calls through the API role: the principal may log calls, but not run campaigns
select set_config('app.user_id', '44444444-4444-4444-4444-444444444444', true);
set local role fees_api_test;
select lives_ok($$ select public.log_parent_call((select id from fx where k = 'pB'), 'connected', (select id from fx where k = 'c1'),
                     null, 'mother', 'will_pay', 'Will pay on Friday', public.fees_today() + 3, null, null) $$,
  'a principal can log a call with a new promise');
select throws_ok($$ select public.log_parent_call((select id from fx where k = 'pB'), 'no_answer', null, public.fees_today() + 1) $$,
  'P0001', 'The call date cannot be in the future', 'calls cannot be dated in the future');
select throws_ok($$ select public.log_parent_call((select id from fx where k = 'pB'), 'busy', null, null, null, null, null, public.fees_today() + 2) $$,
  'P0001', null, 'a promise needs a call that got through');
select throws_ok($$ insert into public.recovery_campaigns (kind, name) values ('calls', 'Not allowed') $$,
  '42501', null, 'a principal cannot create a campaign');
reset role;
select is((select state from public.call_queue(array[(select id from fx where k = 'c1')]) q where q.parent_id = (select id from fx where k = 'pB')),
  'promised', 'a new promise takes the family off the list until its deadline');

-- a call that got through today: next call after recall_days (7)
select set_config('app.user_id', '55555555-5555-5555-5555-555555555555', true);
select public.log_parent_call((select id from fx where k = 'pC'), 'connected', (select id from fx where k = 'c2'), null, 'guardian', 'needs_time');
select is((select state || '/' || (q.next_call_on - public.fees_today()) from public.call_queue(array[(select id from fx where k = 'c2')]) q
            where q.parent_id = (select id from fx where k = 'pC')), 'waiting/7', 'after a call that got through, wait recall_days');
select public.log_parent_call((select id from fx where k = 'pD'), 'no_answer', (select id from fx where k = 'c2'));
select is((select q.next_call_on - public.fees_today() from public.call_queue(array[(select id from fx where k = 'c2')]) q
            where q.parent_id = (select id from fx where k = 'pD')), 3,
  'a family that paid 4 days ago waits recall_days after the payment, even when the call was not answered');
select is((select (public.campaign_detail((select id from fx where k = 'c1')) -> 'stats' ->> 'kept')::int), 2,
  'campaign results count the kept promises');

-- activities and credited receipts -------------------------------------------------------
insert into public.recovery_campaigns (id, kind, name, start_date)
values ('c4c4c4c4-0000-0000-0000-000000000003', 'activity', 'PGTAP4 English club', public.fees_today() - 3);
insert into fx values ('a1', 'c4c4c4c4-0000-0000-0000-000000000003');
insert into public.payments (receipt_no, student_id, session_id, paid_on, amount, mode, source) values
  ('PGTAP4-R4', (select id from fx where k = 'st3'), (select id from fx where k = 's'), public.fees_today() - 1, 40000, 'cash', 'import');
set local role fees_api_test;
select is(public.add_activity_participants((select id from fx where k = 'a1'), array[(select id from fx where k = 'st3'), (select id from fx where k = 'st4')]),
  2, 'two students added to the activity');
select lives_ok($$ select public.credit_recovery_payment(
                     (select id from public.recovery_participants where campaign_id = (select id from fx where k = 'a1') and student_id = (select id from fx where k = 'st3')),
                     (select id from public.payments where receipt_no = 'PGTAP4-R4')) $$, 'the accountant credits a receipt to the activity');
select is((select response from public.recovery_participants where campaign_id = (select id from fx where k = 'a1') and student_id = (select id from fx where k = 'st3')),
  'positive', 'a credited participant counts as a positive response');
select throws_ok($$ select public.credit_recovery_payment(
                      (select id from public.recovery_participants where campaign_id = (select id from fx where k = 'a1') and student_id = (select id from fx where k = 'st3')),
                      (select id from public.payments where receipt_no = 'PGTAP4-R4')) $$, 'P0001', null, 'a receipt counts for one activity only');
select throws_ok($$ select public.credit_recovery_payment(
                      (select id from public.recovery_participants where campaign_id = (select id from fx where k = 'a1') and student_id = (select id from fx where k = 'st4')),
                      (select id from public.payments where receipt_no = 'PGTAP4-R4')) $$, 'P0001', null, 'another student''s receipt cannot be credited');
select throws_ok($$ select public.link_parents_by_phone() $$, '42501', null, 'link_parents_by_phone is not callable through the API');
reset role;
select is((select (public.campaign_detail((select id from fx where k = 'a1')) -> 'stats' ->> 'credited')::bigint), 40000::bigint,
  'the activity shows the credited amount');

-- merging two profiles of one family -------------------------------------------------------
select is(public.merge_parents((select id from fx where k = 'pD'), (select id from fx where k = 'pB')), 1, 'merge moves the children');
select is((select count(*)::int from public.parent_calls where parent_id = (select id from fx where k = 'pB')), 4, 'and the calls');
insert into public.students (admission_no, full_name, phone) values ('PGTAP4-7', 'Gita Four', '9000044444');
select is((select parent_id from public.students where admission_no = 'PGTAP4-7'), (select id from fx where k = 'pB'),
  'a new admission with the merged number joins the family (alternate phone)');

select * from finish();
rollback;
