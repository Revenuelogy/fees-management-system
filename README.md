# School Fees Management & Analytics

Fee collection, receipts and a deep analysis layer that answers one question for the school owner:
**where exactly is my fee money?** What should have come, what has come, what is stuck, and which
class or student is holding it back, at the level of session, month, installment, class and single student.

Built with **Next.js 16** (App Router) and **PostgreSQL** (any PostgreSQL 13+ server: local, Docker, RDS,
Cloud SQL, Neon, Supabase…). Admin-only today, with staff roles (accountant, principal, class teacher) already
modelled.

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

## How it is built

```
Browser (React screens)  ──fetch JSON──▶  REST API  src/app/api/**/route.ts
  SWR cache: instant revisits,             │  session cookie + role check, zod validation
  refresh on focus / every 60 s /          ▼
  after every save                       Services  src/server/services/*
                                           │  in-memory cache (30 s), cleared by every write
                                           ▼
                                         PostgreSQL  db/migrations/*  (tables, RLS, SQL functions)
```

* **Frontend and backend are separate.** Screens are React components that only call the JSON API under
  `/api`; they never touch the database. The API could serve another client (a mobile app, a script) as is.
* **Any PostgreSQL.** The server connects with a single `DATABASE_URL` through `pg`. Logins and sessions
  live in the app's own tables (`app_users`, `app_sessions`; passwords hashed with scrypt). Every query runs
  in a transaction that records the signed-in staff member, so the role checks inside the SQL functions,
  row-level security and the audit log all know who is acting.
* **Caching.** The API keeps database reads in memory for `CACHE_TTL_SECONDS` (default 30 s) and shares one
  query between simultaneous identical requests. Every write made through the API clears that cache, so the
  next screen shows the new figures at once; the TTL only bounds how long a change made elsewhere (another
  app instance, a manual SQL fix) takes to appear. The browser keeps what it fetched (SWR), shows it instantly
  when you come back to a screen, and refreshes it in the background when the tab regains focus, once a minute,
  and after every save. API responses are `Cache-Control: private, no-store`, so nothing is stored by a CDN.

### API overview

| Area | Endpoints |
| --- | --- |
| Sign in | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/bootstrap` (viewer, sessions, classes, settings) |
| Analytics | `GET /api/analytics/dashboard`, `defaulters`, `balances`, `classes`, `classes/[id]`, `months/[month]` (+ `/payments`, `/non-payers`, `/classes/[classId]`), `installments`, `installments/[number]`, `reconciliation` |
| Students | `GET/POST /api/students`, `GET /api/students/search`, `GET/PUT/DELETE /api/students/[id]`, `…/360`, `…/dues`, `…/fees`, `…/withdraw`, `…/reactivate`, `…/notes`, `…/charges`, `…/charges/generate`, `…/concessions`, `…/opening-dues` |
| Money | `GET/POST /api/payments`, `GET /api/payments/[id]`, `POST /api/payments/[id]/cancel`, `GET/POST /api/targets`, `GET/DELETE /api/targets/[id]` |
| Setup | `/api/sessions` (+ `/[id]`, `/current`, `/installments`), `/api/installments/[id]`, `/api/classes`, `/api/fee-heads`, `/api/fee-structure` (+ `/copy`, `/apply`), `/api/promote`, `POST /api/imports/[kind]`, `GET /api/setup/checklist`, `GET /api/setup/classes` |
| Admin | `/api/settings` (+ `/allocation-rule`), `/api/staff` (+ `/[id]`, `/[id]/password`), `POST /api/admin/reallocate`, `POST /api/months/[month]/close` and `/reopen`, `GET /api/admin/snapshots`, `GET /api/admin/audit` |

Money is integer paise in every request and response; dates are `YYYY-MM-DD`. Errors come back as
`{ "error": "…" }` with a status code (400 invalid, 401 not signed in, 403 role, 404, 409 conflict).

## Running it locally

Requirements: Node 20.12+ (22 LTS recommended) and PostgreSQL 13+ with the `pg_trgm` extension (included in
the standard packages and Docker images). For example with Docker:

```bash
docker run -d --name fees-db -p 5432:5432 \
  -e POSTGRES_USER=fees -e POSTGRES_PASSWORD=fees -e POSTGRES_DB=fees postgres:17
```

```bash
npm install
cp .env.example .env.local    # set DATABASE_URL
npm run db:reset              # creates the schema + loads demo data (2 sessions, ~340 students)
npm run dev                   # http://localhost:3000
```

Demo login: **admin@school.test** / **admin12345**.

Database scripts (they read `DATABASE_URL` from the environment or `.env.local`):

| Script | What it does |
| --- | --- |
| `npm run db:migrate` | Applies new files from `db/migrations`, in order, once each (tracked in `schema_migrations`). |
| `npm run db:seed` | Loads the demo data (local only). |
| `npm run db:reset` | Drops everything, migrates and seeds. Refuses non-local databases unless you add `-- --force`. |
| `npm run db:test` | pgTAP tests for the allocation engine, security and reconciliation (needs the `pgtap` extension, e.g. `apt install postgresql-17-pgtap`). |
| `npm run db:create-user -- --email … --password … [--name …] [--role …]` | Creates a login. The first login on a new database becomes admin. |
| `npm run db:set-password -- --email … --password …` | Sets a new password from the command line. |

Other checks: `npm run typecheck`, `npm run lint`.

## Deploying (any PostgreSQL + any Node host)

1. Create a PostgreSQL 13+ database and note its connection string (add `?sslmode=require` or whatever your
   provider documents).
2. Create the schema (do **not** run the demo seed in production):
   ```bash
   DATABASE_URL=postgres://… npm run db:migrate
   ```
3. Create the owner's login. **The first login becomes admin automatically**; later logins get no access
   until an admin assigns a role in *Settings → Staff* (where the admin can also create logins and set new
   passwords):
   ```bash
   DATABASE_URL=postgres://… npm run db:create-user -- --email owner@school.in --password '…' --name "Owner"
   ```
4. Deploy the Next.js app (`npm run build && npm start`, Vercel, Docker…) with `DATABASE_URL` set, and
   optionally `DATABASE_POOL_MAX` and `CACHE_TTL_SECONDS` (see `.env.example`). With several instances behind
   a load balancer each keeps its own cache; writes clear it on the instance that handled them and the others
   catch up within `CACHE_TTL_SECONDS` (set it lower, or to 0, if that matters).
5. Sign in and follow *Setup checklist*: create the session with its installments → classes and fee
   heads → fee structure → import or add students (with class) → generate charges → import opening dues
   and old receipts if you have them → start collecting.

After updating the code, run `npm run db:migrate` again before starting the new version.

**Optional: a least-privilege database role.** The simplest setup connects as the schema owner. For defence
in depth, connect the app as a separate role; row-level security and function privileges then apply to every
query the app makes:

```sql
create role fees_app login password '…';
select public.grant_app_access('fees_app');   -- as the schema owner; repeat after new migrations
```

## Roles

| Role | Access |
| --- | --- |
| Admin (owner / director) | Everything, including settings, staff, closing months and re-running allocation. |
| Accountant | Collect fees, cancel receipts, edit students and fee data, imports, reconciliation. |
| Principal | Read-only analytics, class and student views. |
| Class teacher | Reserved for a later release (own class only); currently no data access. |

Access is checked by the API on every request and again inside every SQL function (and by row-level security
when the app connects as a least-privilege role), not just in the UI. Writes to payments are only possible
through the `collect_payment` / `cancel_payment` functions; every payment, cancellation, import, month close,
role change and password reset is written to the audit log. Sign-in attempts are rate limited, sessions end
after 7 days without use (30 days at most), and signing out ends the session on the server.

## Project layout

```
db/
  migrations/   schema + RLS, allocation engine, operations, analytics, app access
  seed.sql      deterministic demo data (local only)
  tests/        pgTAP tests (npm run db:test)
scripts/db.mjs  migrate / seed / reset / test / create-user / set-password
src/
  app/api/      the REST API (route handlers)
  app/(app)/    signed-in screens (dashboard, monthly, installments, classes, students,
                collect, payments, pending, reports, setup, settings, admin); each page renders a
                client view that loads its data from the API
  app/login     sign in
  server/       backend only: database pool, auth, cache, validation, services
  components/   UI kit, charts, layout (app shell, sidebar, search, session switcher)
  lib/          shared types, formatting (money is integer paise), roles; lib/api = browser API client
```

See `AGENTS.md` for coding conventions.
