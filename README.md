# School Fees Management & Analytics

Fee collection, receipts and a deep analysis layer that answers one question for the school owner:
**where exactly is my fee money?** What should have come, what has come, what is stuck, and which
class or student is holding it back, at the level of session, month, installment, class and single student.

Built with **Next.js 16** (App Router) and **Supabase Postgres**. Admin-only today, with staff roles
(accountant, principal, class teacher) already modelled.

## What you can do

| Area | Screen | What it shows |
| --- | --- | --- |
| Analysis | **Dashboard** (`/`) | Session expected, received, pending, due-to-date gap, previous dues recovered; class-wise pending with share of total; class-wise collection %; monthly trend (monthly and cumulative); top defaulters (by amount or days silent); students by fee status; pending by fee head; payment modes. Toggle *current session only* / *including previous dues*. |
| | **Monthly** (`/monthly`) | Any month: expected (due this month, optional carry-over and previous dues), received month-to-date, still to come and the daily run-rate needed, students who paid / did not pay, what the money paid for (current year vs previous dues vs advance), daily and cumulative charts, class contribution, payment modes. Past months use the same layout; closed months are frozen snapshots. |
| | **Month › class** (`/monthly/2026-09/<class>`) | Every student of the class in that month: paid this month, *what it paid for* (session, installment, fee head), % of their outstanding balance it cleared, balance after, status. Paid / not-paid filter. Totals match the month page. |
| | **Installments** (`/installments`) | Expected vs received vs gap per installment, on time / late / missing, collection targets ("90% of fees due by 31 Dec") with the list of students who would close the gap. |
| | **Installment detail** (`/installments/2`) | Gap by class (with share of gap), gap by student group (paid full / >½ / <½ / nothing), the smallest set of students holding 50% of the gap ("who to call first"), timing of payments vs due date, late catch-up. |
| | **Classes** / **Class view** | The dashboard scoped to one class (and section): KPIs, status counts, month strip (click into month › class), installment strip, paid-% bands, student table. |
| | **Student 360** (`/students/<id>`) | In plain words: what they were supposed to pay, what they paid, where the recent payment went (current year or old dues), what remains. Installment ladder, payment history with allocation and % of balance cleared, dues by session, payment habit, notes and promised dates. |
| Fees | **Collect fee** (`/collect`) | Type-ahead search (name, admission no, father, phone; Ctrl+K anywhere). Shows open dues oldest first; automatic allocation preview or choose exactly what the payment covers; cash / UPI / cheque / bank / card with references; saves and opens the receipt. |
| | **Receipt** (`/payments/<id>`) | Printable receipt (single or parent + office copy), amount in words, what each rupee paid for, balance before/after. Cancel with a reason (creates a reversing entry, original stays on record). |
| | **Payments & receipts** | Register by date range with split current / previous dues / advance, mode totals, search by receipt or cheque/UTR, CSV export. |
| | **Pending fees** | Everyone who owes money; overdue-only, previous-dues and left-students views; filter by class, section, status; CSV and print. |
| | **Owner summary** | One page: KPIs, this month, class-wise pending, top 10 defaulters, month-by-month. Print / save as PDF, share on WhatsApp or email. |
| Setup | Sessions & installments, classes & fee heads, fee structure grid, promote students to the next session, CSV imports (students, opening dues, historical payments). |
| Admin | School settings and allocation rule, staff & roles, reconciliation checks, re-run allocation, close/reopen months, audit log. |

Every table can be sorted, searched and exported to CSV (Excel) with the filters written into the file.

## How the numbers work

Two tables feed every number, which is why the parts always add up to the totals:

* **`student_charges`** – what each student must pay, per installment and fee head, after concessions (*expected*).
* **`allocations`** – what each payment paid for (*received*). A payment of ₹10,000 can become ₹4,000
  against 2025-26 arrears and ₹6,000 against Installment 1 of 2026-27.

| Term | Meaning |
| --- | --- |
| Session | One academic year, normally 1 April – 31 March (e.g. 2026-27). |
| Expected | Charges of the session after concessions. *Due-to-date expected* counts only installments whose due date has passed. |
| Received | Money allocated to those charges (whenever it was paid). |
| Pending | Expected − received. *Overdue* is the same for installments already due. |
| Previous dues | Unpaid charges of earlier sessions. *Opening* = unpaid on the first day of the session; *recovered* = paid since. |
| Advance | Money not yet matched to any charge (applied automatically when new charges appear). |

**Fee status** (live, per student): *Paid up* (nothing due to date), *Partial*, *Not paying* (nothing paid
against this session), *Arrears only* (this session clear, old dues remain), *Concession / free*.

### Payment allocation rule

Applied to each payment in date order, and re-run automatically whenever charges, concessions or rules change:

1. Lines chosen at the counter ("choose what it pays for") or saved from the automatic preview.
2. Hints on imported receipts (session / fee head / installment named by the old ERP).
3. Default rule (Settings): **oldest dues first** – previous sessions, then the earliest installment,
   then fee heads in priority order; or **current session first**, then the oldest dues.
4. Anything above all dues is held as an **advance**.

Payments are append-only. Cancelling a receipt adds a reversing entry dated today, so a closed month never
changes; the correction shows in the month it was made. Imported receipts without hints are marked
*inferred* so you know the split came from the rule rather than the receipt.

### Consistency checks

`Admin › Reconciliation` runs these live for any session: sum of class pending = school pending; sum of
monthly received = session received; installment received + previous dues + advance = total received;
every payment fully allocated; no charge over-collected; enrolled students without a fee plan.

## Running it locally

Requirements: Node 20+, Docker (for the local Supabase stack).

```bash
npm install
cp .env.example .env.local
npx supabase start            # prints the API URL and publishable/secret keys -> put them in .env.local
npx supabase db reset         # applies migrations + loads demo data (2 sessions, ~340 students)
npm run dev                   # http://localhost:3000
```

Demo login: **admin@school.test** / **admin12345**.

Useful scripts: `npm run typecheck`, `npm run lint`, `npm run db:test` (pgTAP tests for the allocation
engine, security and reconciliation), `npm run db:types`.

## Deploying (Supabase + Vercel or any Node host)

1. Create a Supabase project. In *Authentication → Sign In / Providers* keep Email enabled and
   **turn off "Allow new users to sign up"** (staff accounts are created by the admin).
2. Link and push the schema (do **not** run the demo seed in production):
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
3. In *Authentication → Users* add the owner's account. **The first user becomes admin automatically**;
   later users get no access until an admin assigns a role in *Settings → Staff*.
4. Deploy the Next.js app (e.g. Vercel) with environment variables:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and optionally
   `SUPABASE_SECRET_KEY` (server only; lets the admin create staff logins from the app).
5. Sign in and follow *Setup checklist*: create the session with its installments → classes and fee
   heads → fee structure → import or add students (with class) → generate charges → import opening dues
   and old receipts if you have them → start collecting.

## Roles

| Role | Access |
| --- | --- |
| Admin (owner / director) | Everything, including settings, staff, closing months and re-running allocation. |
| Accountant | Collect fees, cancel receipts, edit students and fee data, imports, reconciliation. |
| Principal | Read-only analytics, class and student views. |
| Class teacher | Reserved for a later release (own class only); currently no data access. |

Access is enforced in the database with row-level security and role checks inside every function, not
just in the UI. Writes to payments are only possible through the `collect_payment` / `cancel_payment`
functions; every payment, cancellation, import and month close is written to the audit log.

## Project layout

```
supabase/
  migrations/   schema + RLS, allocation engine, operations RPCs, analytics RPCs
  seed.sql      deterministic demo data (local only)
  tests/        pgTAP tests (npm run db:test)
src/
  app/(app)/    signed-in screens (dashboard, monthly, installments, classes, students,
                collect, payments, pending, reports, setup, settings, admin)
  app/login     sign in
  components/   UI kit, charts, layout (sidebar, search, session switcher)
  lib/          auth guards, session context, formatting (money is integer paise), RPC types
```

See `AGENTS.md` for coding conventions.
