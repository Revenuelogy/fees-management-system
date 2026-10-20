// Shapes returned by the API and the database RPCs behind it (db/migrations). Money is integer paise.

export type AppRole = "admin" | "accountant" | "principal" | "teacher";
export type PaymentMode = "cash" | "upi" | "cheque" | "bank_transfer" | "card" | "other";
export type AllocationKind = "current" | "arrears" | "advance";
export type FeeStatus = "paid_up" | "partial" | "not_paying" | "arrears_only" | "free" | "no_plan";

/** The signed-in login (GET /api/auth/me). role NULL = no access yet. */
export interface Viewer {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole | null;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole | null;
  class_ids: string[];
  created_at: string;
}

export interface AcademicSession {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface SchoolClass {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface FeeHead {
  id: string;
  name: string;
  priority: number;
  is_active: boolean;
}

export interface Installment {
  id: string;
  session_id: string;
  number: number;
  name: string;
  due_date: string;
}

export interface SchoolSettings {
  id: number;
  school_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  affiliation: string | null;
  receipt_prefix: string;
  receipt_footer: string | null;
  timezone: string;
  allocation_order: "oldest_first" | "current_first";
  session_start_month: number;
}

export interface Student {
  id: string;
  admission_no: string;
  full_name: string;
  father_name: string | null;
  mother_name: string | null;
  phone: string | null;
  alt_phone: string | null;
  email: string | null;
  dob: string | null;
  gender: "M" | "F" | "O" | null;
  address: string | null;
  admission_date: string | null;
  status: "active" | "left" | "passed_out";
  left_on: string | null;
  erp_id: string | null;
  remarks: string | null;
}

export interface StudentBalance {
  student_id: string;
  admission_no: string;
  full_name: string;
  father_name: string | null;
  phone: string | null;
  student_status: Student["status"];
  class_id: string | null;
  class_name: string | null;
  class_order: number | null;
  section: string | null;
  roll_no: string | null;
  gross: number;
  concession: number;
  expected: number;
  due_expected: number;
  received: number;
  due_received: number;
  pending: number;
  overdue: number;
  prev_opening: number;
  prev_recovered: number;
  prev_pending: number;
  total_pending: number;
  total_overdue: number;
  advance_balance: number;
  last_paid_on: string | null;
  days_since_payment: number | null;
  paid_pct: number | null;
  fee_status: FeeStatus;
}

export interface StatusCounts {
  paid_up: number;
  partial: number;
  not_paying: number;
  arrears_only: number;
  free: number;
  no_plan?: number;
}

export interface Bands {
  full: number;
  over_half: number;
  under_half: number;
  nothing: number;
}

export interface ClassSummaryRow {
  class_id: string | null;
  class_name: string;
  students: number;
  expected: number;
  received: number;
  pending: number;
  due_expected: number;
  overdue: number;
  prev_pending: number;
  concession: number;
  share_of_pending: number;
  collection_pct: number | null;
  due_collection_pct: number | null;
  status: StatusCounts;
  bands: Bands;
}

export interface TrendPoint {
  month: string;
  label: string;
  expected: number;
  received: number;
  current: number;
  arrears: number;
  advance: number;
  cum_expected: number;
  cum_current: number;
  cum_received: number;
  is_future: boolean;
}

export interface Dashboard {
  session: AcademicSession;
  today: string;
  include_arrears: boolean;
  kpis: {
    students_enrolled: number;
    students_billed: number;
    gross: number;
    concession: number;
    session_expected: number;
    session_received: number;
    session_pending: number;
    session_due_expected: number;
    session_due_received: number;
    session_overdue: number;
    prev_opening: number;
    prev_recovered: number;
    prev_pending: number;
    advance_held: number;
    students_with_overdue: number;
    students_with_prev_dues: number;
  };
  status: StatusCounts;
  cash: { total: number; current: number; arrears: number; advance: number };
  classes: ClassSummaryRow[];
  trend: TrendPoint[];
  heads: { fee_head: string; expected: number; received: number; pending: number }[];
  modes: { mode: PaymentMode; amount: number; count: number }[];
}

export interface MonthSummaryNumbers {
  due_in_month: number;
  prepaid: number;
  carry_over: number;
  arrears_outstanding: number;
  expected: number;
  collected_against_target: number;
  still_to_come: number;
  received: number;
  received_current: number;
  received_arrears: number;
  received_advance: number;
  payments_count: number;
  reversals: number;
  students_paid: number;
  students_expected: number;
  students_expected_paid: number;
  students_expected_not_paid: number;
  students_cleared: number;
  days_in_month: number;
  days_elapsed: number;
  days_left: number;
  run_rate_needed: number | null;
  collection_pct: number | null;
}

export interface MonthClassRow {
  class_id: string | null;
  class_name: string;
  received: number;
  current: number;
  arrears: number;
  advance: number;
  share: number;
  expected: number;
  collected: number;
  still_to_come: number;
  collection_pct: number | null;
  students_paid: number;
  students_expected: number;
  students_not_paid: number;
}

export interface MonthSummary {
  month: string;
  label: string;
  start: string;
  end: string;
  today: string;
  status: "upcoming" | "current" | "past";
  carry: boolean;
  arrears: boolean;
  session: AcademicSession;
  summary: MonthSummaryNumbers;
  daily: { date: string; day: number; amount: number; count: number; cumulative: number; is_future: boolean }[];
  classes: MonthClassRow[];
  modes: { mode: PaymentMode; amount: number; count: number }[];
  heads: { fee_head: string; amount: number }[];
  closed: null | {
    closed_at: string;
    snapshot: { summary: MonthSummaryNumbers; classes: MonthClassRow[]; modes: MonthSummary["modes"] } | null;
  };
}

export interface AllocationLine {
  session: string | null;
  installment: string | null;
  installment_no: number | null;
  fee_head: string | null;
  amount: number;
  kind: AllocationKind;
  is_inferred?: boolean;
}

export interface MonthPayment {
  payment_id: string;
  receipt_no: string;
  paid_on: string;
  amount: number;
  mode: PaymentMode;
  reference_no: string | null;
  source: "app" | "import";
  is_reversal: boolean;
  cancelled: boolean;
  student_id: string;
  full_name: string;
  admission_no: string;
  father_name: string | null;
  class_id: string | null;
  class_name: string | null;
  section: string | null;
  roll_no: string | null;
  allocations: AllocationLine[];
}

export interface NonPayer {
  student_id: string;
  full_name: string;
  admission_no: string;
  father_name: string | null;
  phone: string | null;
  class_id: string | null;
  class_name: string;
  section: string | null;
  roll_no: string | null;
  owed: number;
  last_paid_on: string | null;
}

export interface MonthClassStudent {
  student_id: string;
  full_name: string;
  admission_no: string;
  father_name: string | null;
  phone: string | null;
  section: string | null;
  roll_no: string | null;
  paid: number;
  paid_current: number;
  paid_arrears: number;
  paid_advance: number;
  paid_for: AllocationLine[];
  outstanding_start: number;
  balance_after: number;
  pct_of_outstanding: number | null;
  target: number;
  target_remaining: number;
  status: "paid" | "partial" | "not_paid" | "nothing_due";
  receipts: { payment_id: string; receipt_no: string; paid_on: string; amount: number; mode: PaymentMode }[];
}

export interface MonthClassDetail {
  month: string;
  label: string;
  session: { id: string; name: string };
  class: { id: string; name: string };
  carry: boolean;
  arrears: boolean;
  students: MonthClassStudent[];
}

export interface InstallmentRow {
  id: string;
  number: number;
  name: string;
  due_date: string;
  next_due: string | null;
  students: number;
  students_cleared: number;
  gross: number;
  concession: number;
  expected: number;
  received: number;
  on_time: number;
  late: number;
  gap: number;
  collection_pct: number | null;
  status: "upcoming" | "open" | "closed";
}

export interface InstallmentDetail {
  installment: { id: string; number: number; name: string; due_date: string; session_id: string; next_due: string | null };
  today: string;
  summary: {
    students: number;
    expected: number;
    received: number;
    on_time: number;
    late: number;
    gap: number;
    collection_pct: number | null;
    on_time_pct: number | null;
  };
  classes: {
    class_id: string | null;
    class_name: string;
    students: number;
    students_unpaid: number;
    expected: number;
    received: number;
    gap: number;
    share_of_gap: number;
    collection_pct: number | null;
  }[];
  groups: { group: "full" | "over_half" | "under_half" | "nothing"; students: number; expected: number; received: number; missing: number }[];
  students: {
    student_id: string;
    full_name: string;
    admission_no: string;
    phone: string | null;
    class_name: string;
    section: string | null;
    expected: number;
    received: number;
    gap: number;
    cumulative: number;
    cumulative_pct: number;
    in_top_half: boolean;
    group: "over_half" | "under_half" | "nothing";
  }[];
  timing: { bucket: "on_time" | "late_15" | "late_30" | "late_30_plus"; amount: number; payments: number }[];
  catch_up: { next_due: string | null; amount: number; payments: number };
}

export interface CollectionTarget {
  id: string;
  session_id: string;
  name: string;
  target_pct: number;
  target_date: string;
}

export interface TargetProgress {
  target: CollectionTarget;
  expected: number;
  received: number;
  goal: number;
  gap: number;
  current_pct: number | null;
  students_to_close: {
    student_id: string;
    full_name: string;
    admission_no: string;
    phone: string | null;
    class_name: string;
    section: string | null;
    remaining: number;
    cumulative: number;
  }[];
  classes: { class_name: string; remaining: number; students: number }[];
}

export interface ClassDetail {
  session: { id: string; name: string };
  class: { id: string; name: string };
  include_arrears: boolean;
  kpis: {
    students: number;
    expected: number;
    received: number;
    pending: number;
    due_expected: number;
    overdue: number;
    concession: number;
    prev_pending: number;
    status: StatusCounts;
    bands: Bands;
  };
  sections: { section: string; students: number }[];
  months: { month: string; label: string; expected: number; received: number; current: number; arrears: number; payers: number; is_future: boolean }[];
  installments: { id: string; number: number; name: string; due_date: string; expected: number; received: number; gap: number; collection_pct: number | null }[];
}

export interface DueLine {
  charge_id: string;
  session_id: string;
  session_name: string;
  session_start: string;
  installment_id: string;
  installment_no: number;
  installment_name: string;
  due_date: string;
  fee_head_id: string;
  fee_head: string;
  fee_head_priority: number;
  amount: number;
  concession: number;
  net_amount: number;
  paid: number;
  remaining: number;
  is_overdue: boolean;
}

export interface Student360Installment {
  installment_id: string;
  number: number;
  name: string;
  due_date: string;
  amount: number;
  concession: number;
  net: number;
  paid: number;
  remaining: number;
  status: "waived" | "paid" | "partial" | "partial_overdue" | "overdue" | "upcoming";
  lines: { charge_id: string; fee_head: string; amount: number; concession: number; net: number; paid: number; remaining: number }[];
}

export interface Student360Payment {
  payment_id: string;
  receipt_no: string;
  paid_on: string;
  amount: number;
  mode: PaymentMode;
  reference_no: string | null;
  remarks: string | null;
  source: "app" | "import";
  session_name: string;
  is_reversal: boolean;
  cancelled: boolean;
  outstanding_before: number;
  pct_of_outstanding: number | null;
  allocations: AllocationLine[];
}

export interface Student360 {
  student: Student;
  enrollments: { session_id: string; session_name: string; class_id: string; class_name: string; section: string; roll_no: string | null; is_current: boolean }[];
  current_session: { id: string; name: string } | null;
  balance: null | {
    session_id: string;
    session_name: string;
    expected: number;
    received: number;
    pending: number;
    overdue: number;
    due_expected: number;
    prev_opening: number;
    prev_recovered: number;
    prev_pending: number;
    total_pending: number;
    total_overdue: number;
    advance_balance: number;
    concession: number;
    last_paid_on: string | null;
    days_since_payment: number | null;
  };
  fee_status: FeeStatus | null;
  last_payment: null | { receipt_no: string; paid_on: string; amount: number; current: number; arrears: number; advance: number };
  sessions: {
    session_id: string;
    session_name: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
    class_name: string | null;
    section: string | null;
    amount: number;
    concession: number;
    net: number;
    paid: number;
    remaining: number;
    overdue: number;
    installments: Student360Installment[];
  }[];
  payments: Student360Payment[];
  notes: { id: string; note: string; promised_date: string | null; promised_amount: number | null; created_at: string; author: string | null }[];
  behaviour: {
    allocated_amount: number;
    avg_days_from_due: number | null;
    on_time_pct: number | null;
    year_end_pct: number | null;
    profile: "no_history" | "year_end" | "early" | "on_time" | "late";
  };
  today: string;
}

export interface ReconciliationCheck {
  key: string;
  label: string;
  left: number | null;
  right: number | null;
  ok: boolean;
  count?: boolean;
  warning?: boolean;
  info?: boolean;
  rows?: number;
}

export interface SearchResult {
  id: string;
  admission_no: string;
  full_name: string;
  father_name: string | null;
  phone: string | null;
  status: Student["status"];
  class_name: string | null;
  section: string | null;
  roll_no: string | null;
}

// ---------------------------------------------------------------------------------------------
// API shapes (src/app/api) that are not plain RPC results
// ---------------------------------------------------------------------------------------------

/** GET /api/students: a student with their enrolment in the requested session (nulls when not enrolled). */
export type StudentListRow = Pick<Student, "id" | "admission_no" | "full_name" | "father_name" | "phone" | "status" | "left_on"> & {
  class_id: string | null;
  class_name: string | null;
  class_order: number | null;
  section: string | null;
  roll_no: string | null;
};

/** GET /api/students/[id] */
export type StudentRecord = {
  student: Student;
  enrollment: { class_id: string; section: string; roll_no: string | null } | null;
  /** receipts on record (a student with receipts cannot be deleted) */
  payments: number;
  /** fee lines waived when the student left (restorable on re-activation) */
  waived_lines: number;
};

/** GET /api/students/[id]/fees */
export type FeePlanData = {
  student: Student;
  enrollments: { session_id: string; section: string; roll_no: string | null; class_id: string; class_name: string }[];
  dues: DueLine[];
  /** source and note of every fee line */
  meta: { id: string; source: string; note: string | null }[];
  installments: Installment[];
  heads: FeeHead[];
  /** money not yet matched to any charge */
  advance: number;
};

/** GET /api/payments: one receipt (or cancellation entry) with its class and what it paid for. */
export interface PaymentRegisterRow {
  payment_id: string;
  receipt_no: string;
  paid_on: string;
  amount: number;
  mode: PaymentMode;
  reference_no: string | null;
  remarks: string | null;
  source: "app" | "import";
  session_id: string;
  student_id: string;
  reverses_payment_id: string | null;
  created_at: string;
  full_name: string;
  admission_no: string;
  father_name: string | null;
  /** class in the session the money was received in */
  class_name: string | null;
  section: string | null;
  current: number;
  arrears: number;
  advance: number;
  /** a later entry cancels this receipt */
  cancelled: boolean;
}

/** GET /api/payments/[id] */
export interface ReceiptData {
  payment: { id: string; student_id: string; receipt_no: string; created_at: string; reverses_payment_id: string | null; created_by_name: string | null };
  student: Student360;
  /** the entry that cancelled this receipt, if any */
  reversal: { id: string; receipt_no: string; paid_on: string; remarks: string | null } | null;
}

/** GET /api/analytics/reconciliation */
export interface Reconciliation {
  session: { id: string; name: string };
  checked_at: string;
  checks: ReconciliationCheck[];
}

/** GET /api/setup/checklist */
export interface SetupChecklist {
  active_heads: number;
  installments: Installment[];
  classes_with_structure: string[];
  /** active students enrolled in the session */
  enrolled: number;
  /** enrolled students without fee lines (null when the check could not run) */
  without_plan: number | null;
}

/** GET /api/sessions: a session with what it holds (sessions holding data cannot be deleted). */
export interface SessionSetupRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  enrollments: number;
  payments: number;
  charges: number;
  installments: { id: string; number: number; name: string; due_date: string; charges: number }[];
}

/** GET /api/setup/classes */
export interface ClassSetupRow {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  /** enrolments in every session */
  enrolments: number;
  /** enrolments in the requested session */
  inSession: number;
  /** fee structure amounts (all sessions) */
  structure: number;
}

export interface FeeHeadSetupRow {
  id: string;
  name: string;
  priority: number;
  is_active: boolean;
  charges: number;
  structure: number;
}

/** GET /api/fee-structure */
export interface FeeStructureData {
  installments: Installment[];
  heads: FeeHead[];
  /** paise by `${fee_head_id}|${installment_id}` */
  amounts: Record<string, number>;
  classes_with_structure: string[];
  /** active students of the class enrolled in the session, and how many of them have fee lines */
  enrolled: number;
  with_charges: number;
  no_plan: ReconciliationCheck | null;
}

/** GET /api/promote */
export interface PromotePreview {
  by_class: { class_id: string; active: number; inactive: number; already: number }[];
  target_has_structure: string[];
  /** students already enrolled in the target session */
  target_enrolled: number;
}

/** GET /api/staff */
export interface StaffMember extends Profile {
  last_sign_in_at: string | null;
}

/** GET /api/admin/snapshots: a closed month */
export interface MonthSnapshot {
  month: string;
  closed_at: string;
  closed_by_name: string | null;
}

/** GET /api/admin/audit */
export interface AuditRow {
  id: number;
  at: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  details: unknown;
}
