-- =============================================================================
-- What a caller may do
--
-- A caller reads every family's full profile (students, fees, payments, promises, activities, calls, notes)
-- and writes only calls, notes and a family's response to an activity. In the database a caller therefore
-- reads like the other staff (is_staff) but never writes fee data (can_write stays admin / accountant). Which
-- screens and endpoints a caller may open is decided by the API, which allows callers only the calling ones;
-- the Home figures (home_*, migration 012) also refuse them here (sees_school).
-- =============================================================================

-- Staff who may read fee data of families: every role except teachers (callers included)
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() in ('admin', 'accountant', 'principal', 'caller'), false)
$$;

-- Staff who may see school-wide figures (Home, reports): everybody but callers
create function public.sees_school() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() in ('admin', 'accountant', 'principal'), false)
$$;

create function public.assert_sees_school() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sees_school() then
    raise exception 'You don''t have access to this page' using errcode = '42501';
  end if;
end $$;

-- Notes on a student: any staff member, callers included (deleting stays with admin / accountant)
create policy staff_insert on public.student_notes for insert to public with check ((select public.is_staff()));

-- ---------------------------------------------------------------------------
-- A family's response to an activity (callers record it after a call)
-- ---------------------------------------------------------------------------
create function public.set_participant_response(p_participant uuid, p_response text, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_staff();
  if p_response not in ('pending', 'positive', 'partial', 'negative') then raise exception 'Choose a response'; end if;
  update public.recovery_participants
     set response = p_response, note = nullif(trim(p_note), ''), updated_by = public.current_user_id(), updated_at = now()
   where id = p_participant;
  if not found then raise exception 'Participant not found'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Find a family: by a parent's name or phone, or a child's name, admission number, parents' names or phone
-- ---------------------------------------------------------------------------
create function public.search_families(p_query text, p_limit integer default 20)
returns table (
  parent_id  uuid,
  name       text,
  phone      text,
  alt_phone  text,
  relation   text,
  children   jsonb
)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare
  q        text := lower(trim(coalesce(p_query, '')));
  v_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  v_sess   uuid := public.running_session();
begin
  perform public.assert_staff();
  if length(q) < 2 then return; end if;

  return query
  with hit as (
    select p.id
      from public.parents p
     where lower(p.name) like '%' || q || '%'
        or (length(v_digits) >= 4 and (p.phone like '%' || v_digits || '%' or coalesce(p.alt_phone, '') like '%' || v_digits || '%'))
    union
    select st.parent_id
      from public.students st
     where st.parent_id is not null
       and (st.search_text like '%' || q || '%'
            or (length(v_digits) >= 4 and regexp_replace(coalesce(st.phone, ''), '\D', '', 'g') like '%' || v_digits || '%'))
  )
  select p.id, p.name, p.phone, p.alt_phone, p.relation,
         (select coalesce(jsonb_agg(jsonb_build_object('student_id', st.id, 'full_name', st.full_name,
                                                       'admission_no', st.admission_no, 'status', st.status,
                                                       'class_name', c.name, 'section', e.section)
                                    order by c.sort_order nulls last, st.full_name), '[]'::jsonb)
            from public.students st
            left join public.enrollments e on e.student_id = st.id and e.session_id = v_sess
            left join public.classes c on c.id = e.class_id
           where st.parent_id = p.id)
    from hit
    join public.parents p on p.id = hit.id
   order by (lower(p.name) like q || '%') desc, p.name, p.phone
   limit greatest(1, least(p_limit, 50));
end $$;

-- ---------------------------------------------------------------------------
-- Open promises: each family's latest promise that is still waiting for its date (+ the grace days), soonest
-- first, with what the family owes now (overdue this year + old balance)
-- ---------------------------------------------------------------------------
create function public.open_promises()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.fees_today();
  v_sess  uuid := public.running_session();
  v_out   jsonb;
begin
  perform public.assert_staff();
  with lp as (
    select distinct on (x.parent_id) x.*
      from public.parent_promises() x
     order by x.parent_id, x.made_on desc, x.made_at desc
  ),
  open as (select * from lp where lp.status = 'pending'),
  fam as (   -- what the families with an open promise owe now
    select st.parent_id as pid, sum(b.total_overdue)::bigint as tod
      from public.academic_sessions s
     cross join lateral public.student_balances(s.id) b
      join public.students st on st.id = b.student_id
     where s.id = v_sess and st.parent_id in (select open.parent_id from open)
     group by st.parent_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'parent_id', o.parent_id, 'name', p.name, 'phone', p.phone, 'source', o.source,
           'student_name', st.full_name, 'made_on', o.made_on, 'made_by_name', coalesce(nullif(pf.full_name, ''), pf.email),
           'promised_date', o.promised_date, 'promised_amount', o.promised_amount, 'deadline', o.deadline,
           'paid', o.paid, 'days_left', o.promised_date - v_today, 'total_overdue', coalesce(fam.tod, 0),
           'children', (select coalesce(jsonb_agg(s2.full_name order by s2.full_name), '[]'::jsonb)
                          from public.students s2 where s2.parent_id = o.parent_id and s2.status = 'active')
         ) order by o.promised_date, p.name), '[]'::jsonb)
    into v_out
    from open o
    join public.parents p on p.id = o.parent_id
    left join public.students st on st.id = o.student_id
    left join public.profiles pf on pf.id = o.made_by
    left join fam on fam.pid = o.parent_id;

  return jsonb_build_object('today', v_today, 'grace_days', (select promise_grace_days from public.school_settings where id = 1),
                            'promises', v_out);
end $$;

revoke execute on all functions in schema public from public;
