-- =============================================================================
-- School Fees Management & Analytics — core schema
--
-- Conventions
--   * Money is stored as BIGINT paise (1 rupee = 100 paise). Never floats.
--   * Payments are append-only. A cancellation is a new reversing payment row.
--   * Allocations (what each payment paid for) are derived data and can be
--     rebuilt at any time by the allocation engine (see next migration).
--   * An academic session normally runs April -> March (e.g. 2026-27).
--   * Plain PostgreSQL (13+). The app connects with DATABASE_URL and, inside
--     each transaction, sets `app.user_id` to the signed-in staff member;
--     public.current_user_id() reads it for role checks, RLS and audit columns.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'accountant', 'principal', 'teacher');
create type public.payment_mode as enum ('cash', 'upi', 'cheque', 'bank_transfer', 'card', 'other');
create type public.student_status as enum ('active', 'left', 'passed_out');
create type public.allocation_kind as enum ('current', 'arrears', 'advance');

-- ---------------------------------------------------------------------------
-- School settings (single row)
-- ---------------------------------------------------------------------------
create table public.school_settings (
  id                  smallint primary key default 1 check (id = 1),
  school_name         text not null default 'My School',
  address             text,
  phone               text,
  email               text,
  affiliation         text,
  receipt_prefix      text not null default 'R',
  receipt_footer      text default 'This is a computer generated receipt.',
  timezone            text not null default 'Asia/Kolkata',
  -- 'oldest_first'  : previous-session dues are cleared before current-session fees (default)
  -- 'current_first' : current-session fees first, then the oldest dues
  allocation_order    text not null default 'oldest_first'
                        check (allocation_order in ('oldest_first', 'current_first')),
  session_start_month smallint not null default 4 check (session_start_month between 1 and 12),
  updated_at          timestamptz not null default now()
);
insert into public.school_settings (id) values (1);

-- ---------------------------------------------------------------------------
-- Logins. Passwords are scrypt hashes written by the app (src/server/auth).
-- ---------------------------------------------------------------------------
create table public.app_users (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  password_hash   text not null,
  created_at      timestamptz not null default now(),
  last_sign_in_at timestamptz
);
create unique index app_users_email_key on public.app_users (lower(email));

-- Sign-in sessions. The browser holds a random token in an httpOnly cookie; only its
-- SHA-256 is stored, so this table never contains a usable credential.
create table public.app_sessions (
  token_hash  text primary key,
  user_id     uuid not null references public.app_users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index app_sessions_user_idx on public.app_sessions (user_id);

-- The signed-in staff member for this transaction (NULL when none).
create function public.current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- Staff profiles (one per login). role NULL = no access yet.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references public.app_users (id) on delete cascade,
  email       text,
  full_name   text,
  role        public.app_role,
  class_ids   uuid[] not null default '{}',   -- reserved for class-teacher scoping
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Academic sessions
-- ---------------------------------------------------------------------------
create table public.academic_sessions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,             -- e.g. '2026-27'
  start_date  date not null,
  end_date    date not null,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  check (end_date > start_date),
  constraint academic_sessions_no_overlap
    exclude using gist (daterange(start_date, end_date, '[]') with &&)
);
create unique index academic_sessions_one_current on public.academic_sessions (is_current) where is_current;

-- ---------------------------------------------------------------------------
-- Classes (global list; a student's class per session lives in enrollments)
-- ---------------------------------------------------------------------------
create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index classes_name_key on public.classes (lower(name));

-- ---------------------------------------------------------------------------
-- Fee heads (tuition, transport, ...). priority: lower is cleared first.
-- ---------------------------------------------------------------------------
create table public.fee_heads (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  priority    integer not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index fee_heads_name_key on public.fee_heads (lower(name));

-- ---------------------------------------------------------------------------
-- Students
-- ---------------------------------------------------------------------------
create table public.students (
  id              uuid primary key default gen_random_uuid(),
  admission_no    text not null unique,
  full_name       text not null,
  father_name     text,
  mother_name     text,
  phone           text,
  alt_phone       text,
  email           text,
  dob             date,
  gender          text check (gender in ('M', 'F', 'O')),
  address         text,
  admission_date  date,
  status          public.student_status not null default 'active',
  left_on         date,
  erp_id          text unique,
  remarks         text,
  search_text     text generated always as (
                    lower(admission_no || ' ' || full_name || ' ' || coalesce(father_name, '') || ' ' ||
                          coalesce(mother_name, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(alt_phone, ''))
                  ) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index students_search_trgm on public.students using gin (search_text extensions.gin_trgm_ops);
create index students_name_idx on public.students (lower(full_name));

-- ---------------------------------------------------------------------------
-- Enrollment of a student in a class for one session
-- ---------------------------------------------------------------------------
create table public.enrollments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete cascade,
  session_id  uuid not null references public.academic_sessions (id) on delete cascade,
  class_id    uuid not null references public.classes (id),
  section     text not null default 'A',
  roll_no     text,
  created_at  timestamptz not null default now(),
  unique (student_id, session_id)
);
create index enrollments_session_class_idx on public.enrollments (session_id, class_id);

-- ---------------------------------------------------------------------------
-- Installment schedule per session
-- ---------------------------------------------------------------------------
create table public.installments (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.academic_sessions (id) on delete cascade,
  number      integer not null check (number > 0),
  name        text not null,
  due_date    date not null,
  unique (session_id, number)
);

-- ---------------------------------------------------------------------------
-- Fee structure: amount per class, per installment, per fee head (template)
-- ---------------------------------------------------------------------------
create table public.fee_structures (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null references public.classes (id) on delete cascade,
  installment_id  uuid not null references public.installments (id) on delete cascade,
  fee_head_id     uuid not null references public.fee_heads (id) on delete cascade,
  amount          bigint not null check (amount >= 0),
  unique (class_id, installment_id, fee_head_id)
);

-- ---------------------------------------------------------------------------
-- Student charges: what each student must pay per installment per fee head.
-- This is the "expected" side of every metric.
-- ---------------------------------------------------------------------------
create table public.student_charges (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students (id) on delete cascade,
  session_id      uuid not null references public.academic_sessions (id) on delete cascade,
  installment_id  uuid not null references public.installments (id) on delete cascade,
  fee_head_id     uuid not null references public.fee_heads (id),
  amount          bigint not null check (amount >= 0),
  concession      bigint not null default 0 check (concession >= 0),
  net_amount      bigint generated always as (amount - concession) stored,
  source          text not null default 'structure'
                    check (source in ('structure', 'manual', 'opening', 'import')),
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (concession <= amount),
  unique (student_id, installment_id, fee_head_id)
);
create index student_charges_session_idx on public.student_charges (session_id, installment_id);
create index student_charges_student_idx on public.student_charges (student_id);

-- keep session_id consistent with the installment
create function public.student_charges_set_session() returns trigger
language plpgsql as $$
begin
  select session_id into new.session_id from public.installments where id = new.installment_id;
  new.updated_at := now();
  return new;
end $$;
create trigger student_charges_set_session
  before insert or update on public.student_charges
  for each row execute function public.student_charges_set_session();

-- ---------------------------------------------------------------------------
-- Payments (append-only receipts). amount < 0 only for reversal rows.
-- ---------------------------------------------------------------------------
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  receipt_no          text not null unique,
  student_id          uuid not null references public.students (id) on delete restrict,
  session_id          uuid not null references public.academic_sessions (id),   -- session in which money was received
  paid_on             date not null,
  amount              bigint not null check (amount <> 0),
  mode                public.payment_mode not null default 'cash',
  reference_no        text,
  remarks             text,
  session_hint_id     uuid references public.academic_sessions (id),
  fee_head_hint_id    uuid references public.fee_heads (id),
  installment_hint_id uuid references public.installments (id),
  source              text not null default 'app' check (source in ('app', 'import')),
  erp_id              text unique,
  reverses_payment_id uuid unique references public.payments (id),
  created_by          uuid default public.current_user_id() references public.app_users (id) on delete set null,
  created_at          timestamptz not null default now(),
  check ((amount < 0) = (reverses_payment_id is not null))
);
create index payments_student_idx on public.payments (student_id, paid_on);
create index payments_paid_on_idx on public.payments (paid_on);
create index payments_session_idx on public.payments (session_id);

-- Explicit allocation targets chosen at the counter (or by an import).
create table public.payment_targets (
  payment_id  uuid not null references public.payments (id) on delete cascade,
  charge_id   uuid not null references public.student_charges (id) on delete cascade,
  amount      bigint not null check (amount > 0),
  primary key (payment_id, charge_id)
);
create index payment_targets_charge_idx on public.payment_targets (charge_id);

-- ---------------------------------------------------------------------------
-- Allocations: the split of each payment into what it paid for.
-- Rebuilt by public.reallocate_student(); never edited by hand.
-- ---------------------------------------------------------------------------
create table public.allocations (
  id                  bigint generated always as identity primary key,
  payment_id          uuid not null references public.payments (id) on delete cascade,
  student_id          uuid not null references public.students (id) on delete cascade,
  charge_id           uuid references public.student_charges (id) on delete set null,
  session_id          uuid references public.academic_sessions (id) on delete cascade,  -- session of the charge
  installment_id      uuid references public.installments (id) on delete cascade,
  fee_head_id         uuid references public.fee_heads (id),
  paid_on             date not null,
  payment_session_id  uuid not null references public.academic_sessions (id),
  amount              bigint not null,
  kind                public.allocation_kind not null,
  is_inferred         boolean not null default false,
  created_at          timestamptz not null default now()
);
create index allocations_student_idx on public.allocations (student_id);
create index allocations_charge_idx on public.allocations (charge_id);
create index allocations_payment_idx on public.allocations (payment_id);
create index allocations_paid_on_idx on public.allocations (paid_on);
create index allocations_installment_idx on public.allocations (installment_id);

-- ---------------------------------------------------------------------------
-- Frozen month snapshots (closed months)
-- ---------------------------------------------------------------------------
create table public.monthly_snapshots (
  month       date primary key check (extract(day from month) = 1),
  session_id  uuid not null references public.academic_sessions (id) on delete cascade,
  data        jsonb not null,
  closed_at   timestamptz not null default now(),
  closed_by   uuid default public.current_user_id() references public.app_users (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Collection targets (e.g. 90% of fees due by 31 December)
-- ---------------------------------------------------------------------------
create table public.collection_targets (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.academic_sessions (id) on delete cascade,
  name        text not null,
  target_pct  numeric(5, 2) not null check (target_pct > 0 and target_pct <= 100),
  target_date date not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notes & payment promises per student
-- ---------------------------------------------------------------------------
create table public.student_notes (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students (id) on delete cascade,
  note             text not null,
  promised_date    date,
  promised_amount  bigint check (promised_amount is null or promised_amount > 0),
  created_by       uuid default public.current_user_id() references public.app_users (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index student_notes_student_idx on public.student_notes (student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Receipt numbering per session
-- ---------------------------------------------------------------------------
create table public.receipt_counters (
  session_id  uuid primary key references public.academic_sessions (id) on delete cascade,
  last_no     integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid default public.current_user_id(),
  action     text not null,
  entity     text,
  entity_id  text,
  details    jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);

-- =============================================================================
-- Helper functions
-- =============================================================================

create function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = public.current_user_id()
$$;

-- Staff who may read fee data. Teachers are reserved for a later, class-scoped release.
create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() in ('admin', 'accountant', 'principal'), false)
$$;

create function public.can_write() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() in ('admin', 'accountant'), false)
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

create function public.assert_staff() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
end $$;

create function public.assert_writer() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_write() then
    raise exception 'Not authorised to change fee data' using errcode = '42501';
  end if;
end $$;

create function public.assert_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
end $$;

-- The staff member signed in with a session (no row when unknown or expired). A session ends after
-- p_idle_days without use or p_max_days after sign-in; using it pushes the idle expiry forward
-- (at most once a day).
create function public.session_viewer(p_token_hash text, p_idle_days integer, p_max_days integer)
returns table (id uuid, email text, full_name text, role public.app_role)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  update public.app_sessions s
     set expires_at = now() + make_interval(days => p_idle_days)
   where s.token_hash = p_token_hash
     and s.expires_at > now()
     and s.created_at > now() - make_interval(days => p_max_days)
     and s.expires_at < now() + make_interval(days => p_idle_days - 1);

  return query
  select u.id, u.email, p.full_name, p.role
    from public.app_sessions s
    join public.app_users u on u.id = s.user_id
    left join public.profiles p on p.id = u.id
   where s.token_hash = p_token_hash
     and s.expires_at > now()
     and s.created_at > now() - make_interval(days => p_max_days);
end $$;

-- "Today" in the school's timezone
create function public.fees_today() returns date
language sql stable set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.school_settings where id = 1), 'Asia/Kolkata'))::date
$$;

create function public.session_for_date(p_date date) returns uuid
language sql stable set search_path = public as $$
  select id from public.academic_sessions where p_date between start_date and end_date
$$;

create function public.audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (action, entity, entity_id, details) values (p_action, p_entity, p_entity_id, p_details)
$$;

-- New login -> profile. The very first user becomes admin; others wait for an admin to grant a role.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    split_part(new.email, '@', 1),
    case when exists (select 1 from public.profiles where role = 'admin') then null else 'admin'::public.app_role end
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_app_user_created
  after insert on public.app_users
  for each row execute function public.handle_new_user();

-- Block payments dated inside a closed (snapshotted) month
create function public.payments_check_closed_month() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.monthly_snapshots where month = date_trunc('month', new.paid_on)::date) then
    raise exception 'The month % is closed. Reopen it before recording payments dated in it.',
      to_char(new.paid_on, 'Mon YYYY') using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger payments_check_closed_month
  before insert on public.payments
  for each row execute function public.payments_check_closed_month();

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger students_touch before update on public.students
  for each row execute function public.touch_updated_at();
create trigger school_settings_touch before update on public.school_settings
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- Row level security
-- Enforced when the app connects as a non-owner role (see grant_app_access in
-- the app_access migration); the owner bypasses it. Either way the API checks
-- the role first and every function re-checks it.
-- =============================================================================
alter table public.school_settings    enable row level security;
alter table public.profiles           enable row level security;
alter table public.academic_sessions  enable row level security;
alter table public.classes            enable row level security;
alter table public.fee_heads          enable row level security;
alter table public.students           enable row level security;
alter table public.enrollments        enable row level security;
alter table public.installments       enable row level security;
alter table public.fee_structures     enable row level security;
alter table public.student_charges    enable row level security;
alter table public.payments           enable row level security;
alter table public.payment_targets    enable row level security;
alter table public.allocations        enable row level security;
alter table public.monthly_snapshots  enable row level security;
alter table public.collection_targets enable row level security;
alter table public.student_notes      enable row level security;
alter table public.receipt_counters   enable row level security;
alter table public.audit_log          enable row level security;

-- read for staff
create policy staff_read on public.school_settings    for select to public using ((select public.is_staff()));
create policy staff_read on public.academic_sessions  for select to public using ((select public.is_staff()));
create policy staff_read on public.classes            for select to public using ((select public.is_staff()));
create policy staff_read on public.fee_heads          for select to public using ((select public.is_staff()));
create policy staff_read on public.students           for select to public using ((select public.is_staff()));
create policy staff_read on public.enrollments        for select to public using ((select public.is_staff()));
create policy staff_read on public.installments       for select to public using ((select public.is_staff()));
create policy staff_read on public.fee_structures     for select to public using ((select public.is_staff()));
create policy staff_read on public.student_charges    for select to public using ((select public.is_staff()));
create policy staff_read on public.payments           for select to public using ((select public.is_staff()));
create policy staff_read on public.payment_targets    for select to public using ((select public.is_staff()));
create policy staff_read on public.allocations        for select to public using ((select public.is_staff()));
create policy staff_read on public.monthly_snapshots  for select to public using ((select public.is_staff()));
create policy staff_read on public.collection_targets for select to public using ((select public.is_staff()));
create policy staff_read on public.student_notes      for select to public using ((select public.is_staff()));
create policy admin_read on public.audit_log          for select to public using ((select public.is_admin()));

-- writes for admin / accountant on master data
create policy writer_all on public.classes            for all to public using ((select public.can_write())) with check ((select public.can_write()));
create policy writer_all on public.fee_heads          for all to public using ((select public.can_write())) with check ((select public.can_write()));
create policy writer_all on public.students           for all to public using ((select public.can_write())) with check ((select public.can_write()));
create policy writer_all on public.enrollments        for all to public using ((select public.can_write())) with check ((select public.can_write()));
create policy writer_all on public.installments       for all to public using ((select public.can_write())) with check ((select public.can_write()));
create policy writer_all on public.fee_structures     for all to public using ((select public.can_write())) with check ((select public.can_write()));
create policy writer_all on public.student_charges    for all to public using ((select public.can_write())) with check ((select public.can_write()));
create policy writer_all on public.collection_targets for all to public using ((select public.can_write())) with check ((select public.can_write()));
create policy writer_insert on public.student_notes   for insert to public with check ((select public.can_write()));
create policy writer_delete on public.student_notes   for delete to public using ((select public.can_write()));
create policy writer_all on public.academic_sessions  for all to public using ((select public.can_write())) with check ((select public.can_write()));

-- settings: admin only
create policy admin_update on public.school_settings for update to public
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- profiles: everyone sees their own; admin sees and edits all
create policy own_read on public.profiles for select to public
  using (id = (select public.current_user_id()) or (select public.is_admin()));
create policy admin_update on public.profiles for update to public
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- payments, targets, allocations, snapshots, counters and audit rows are written
-- only through SECURITY DEFINER functions, so no direct write policies exist.
