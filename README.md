# School Fees Management & Analytics

Fee collection, receipts and a deep analysis layer that answers one question for the school owner:
**where exactly is my fee money?** What should have come, what has come, what is stuck, and which
class or student is holding it back, at the level of session, month, installment, class and single student.

Built with **Next.js 16** (App Router) and **PostgreSQL** (any PostgreSQL 13+ server: local, Docker, RDS,
Cloud SQL, Neon, Supabase…). Staff sign in with a role: admin, accountant, principal or caller (class teacher is
reserved for later).

Every page uses the same money words (see *How the numbers work*): **Total fee**, **Received**, **Due now**,
**Due later**, **Balance** and **Old balance**, with **To recover now** = Due now + Old balance.

## What you can do

| Area | Screen | What it shows |
| --- | --- | --- |
| Analysis | **Home** (`/`) | One screen for the owner: what still needs setting up; this year's fees (Received of Total fee, one bar split into Received / Due now / Due later, and the Old balance left and received); **To recover now** (Due now + Old balance, how many students, how many paid nothing this year); today (received today and this month, families to call, promises due today, broken promises); **Chase first** (the first five families of today's call list); each class's share of its Total fee received (red under 30%, amber to 49%, green from 50%). Every figure opens the page behind it; each card loads on its own. |
| | **Months** (`/monthly`) | Any month: the fees due this month (or everything due so far), received this month and Due now, students who paid / owe fees and paid nothing this month, what the money paid for (this year / old balance / paid in advance), daily and running-total charts, class contribution, payment modes. Past months use the same layout; closed months are frozen snapshots. |
| | **Month › class** (`/monthly/2026-09/<class>`) | Every student of the class in that month: received this month, *what it paid for* (session, installment, fee type), % of what they had left that it cleared, what is left now, status. Paid / not-paid filter. Totals match the month page. |
| | **Installments** (`/installments`) | Received per installment, Due now (past its date) or Due later, received on time / late / balance, collection targets ("90% of fees due by 31 Dec") with the students who would make up the shortfall. |
| | **Installment detail** (`/installments/2`) | Due now by class, by student group (paid full / >½ / <½ / nothing), the smallest set of students holding half of it ("call these first"), when payments came compared with the due date, late catch-up. |
| | **Classes** / **Class view** | Each class's Balance, Due now and Old balance; one class (and section): figures, status counts, month strip (click into month › class), installments, paid-% bands, student table. |
| | **Student 360** (`/students/<id>`) | In plain words: Total fee, Received, last payment and where it went ("It cleared last year's old balance"), Balance. Installment ladder, payment history with what each receipt paid for, fees by session, payment habit, notes and promised dates. |
| Fees | **Collect fee** (`/collect`, also in the phone top bar) | Type-ahead search (name, admission no, father, phone; Ctrl+K anywhere). Shows the fees due, oldest first; automatic allocation preview or choose exactly what the payment covers (*Pay due now* / *Pay full balance*); cash / UPI / cheque / bank / card with references; saves and opens the receipt. |
| | **Receipt** (`/payments/<id>`) | Printable receipt (single or parent + office copy), amount in words, what each rupee paid for, what was left to pay before/after. Cancel with a reason (creates a reversing entry, original stays on record). |
| | **Payments & receipts** | Register by date range split into this year / old balance / paid in advance, mode totals, search by receipt or cheque/UTR, CSV export. |
| | **Fees due** (`/pending`) | Everyone with fees due: Balance or Due now, Old balance as its own column, days since last payment; has-old-balance and left-school views; filter by class, section, status; CSV and print. |
| | **Owner report** (`/reports/summary`) | One page: Received, Balance, Due now, Old balance (left and received), To recover now, this month, balance by class, top 10 by due now, month by month. Print / save as PDF, share on WhatsApp or email. |
| Recovery | **Parents** (`/parents`) | Every family as one parent profile (found by phone number, so brothers and sisters share it) with the children's fees added up: Balance, Due now, Old balance, to recover, days since last payment, family status, last call and open promise. To recover grouped by payment habit and by economic condition. |
| | **Parent 360** (`/parents/<id>`) | The family in one place: Total fee, Received and Balance; each child; every receipt; the call history with how each promise turned out; how reliably they keep promises (before the date, on it, within grace, in part, broken); payment habit as recorded by staff next to what the records show; economic condition, concerns about the child, what matters to them, how they behave, best time to call. Log a call from here. |
| | **Recovery dashboard** (`/recovery`) | For today, yesterday, 7 or 30 days, the school year or any dates: the money received and what brought it in (a call, an activity, or the family on its own), compared with the period before, with the results written out in plain sentences; money per day by source; calls per day, picked-up rate, promises and how they turned out; who called the most and what came in after their calls; **does calling make a difference** (share of families we spoke to who paid against the other families with fees due); which activity brought the most; the money by payment habit. |
| | **Calls** (`/calls`) | The daily call list, made fresh every day and ordered by priority, each family with its main reason (broke a promise, asked to call today, large amount to recover, never paid, no payment for 2 months, old balance…) and the amount to recover. Each caller takes a batch (*Give me 10 families*) or picks families, and sees **my list** (to call / done), **everyone to call** (with who took whom) and **called today** (every call, about anything). My calls today / yesterday / 7 / 30 days: calls, picked up, not reached, promises, money that came in after them. Also promises falling due, who is off the list and why, and what each caller did today. **Family call page** (`/calls/<parent>`): one-tap dial, why the family is on the list, and everything about the family read-only (family, each child's Balance / Due now / Old balance, installments, receipts, promises, activities with the family's response, call history, notes) next to the call form with *Save & next family*. |
| | **Find a family** (`/find`), **Promises** (`/promises`) | Search families by a parent's or child's name, admission number or phone; every open promise, soonest date first. Made for callers, open to all staff. |
| | **Activities** (`/activities`) | Every student activity (extra English practice, a club, a trip for students whose fees are paid…) with a verdict (working well / some effect / not working), the fees received because of it, "N of M families paid", responses, and when it runs ("Starts in 15 days", "Ended 26 Oct"); also by class and by student. **Activity** (`/activities/<id>`): add a class or students, record each family's response and count receipts for it. On a student's profile, **Recovery activities** starts an activity for that student alone or adds them to a running one. |
| Setup | Sessions & installments, classes & fee types, fee structure grid and assigning fees to students, promote students to the next session, CSV imports (students, old balance, historical payments). |
| Admin | School settings, allocation rule and promise grace days, staff & roles, reconciliation checks, re-run allocation, close/reopen months, audit log. |

Every table can be sorted, searched and exported to CSV (Excel) with the filters written into the file.

## How the numbers work

Two tables feed every number, which is why the parts always add up to the totals:

* **`student_charges`** – what each student must pay, per installment and fee type, after concessions (*Total fee*).
* **`allocations`** – what each payment paid for (*Received*). A payment of ₹10,000 can become ₹4,000
  against the 2025-26 old balance and ₹6,000 against Installment 1 of 2026-27.

The money words, the same on every page, tooltip, CSV export and printout (`src/lib/glossary.ts`):

| Word | Meaning |
| --- | --- |
| Session | One academic year, normally 1 April – 31 March (e.g. 2026-27). |
| Total fee | What all students must pay this year (fees of the session after concessions). |
| Received | Money that has come in for this year's fees (whenever it was paid). |
| Due now | Due date has passed and it is not paid. |
| Due later | Installments whose due date has not come yet. |
| Balance | Everything still to receive this year: Due now + Due later. |
| Old balance | Left unpaid from earlier years. *Old balance received* = paid during this year. |
| To recover now | Due now + Old balance (Home, the Owner report, and "to recover" on Calls and Parents). |
| Paid in advance | Money not yet matched to any fee (used automatically as new fees are assigned). |

Old balance is always its own figure or column, never added silently into a this-year total.

**Status tags** (live, per student, the same on every page; hover or tap one for its meaning): *Paid up*
(green: no balance due now and no old balance), *Part paid* (blue), *Nothing paid this year* (red), *Old balance
only* (amber: this year clear, old balance left), *Free* (grey).

### Payment allocation rule

Applied to each payment in date order, and re-run automatically whenever charges, concessions or rules change:

1. Lines chosen at the counter ("choose what it pays for") or saved from the automatic preview.
2. Hints on imported receipts (session / fee type / installment named by the old ERP).
3. Default rule (Settings): **oldest fees first** – old balance of earlier sessions, then the earliest installment,
   then fee types in priority order; or **this year first**, then the old balance.
4. Anything above all fees is held as **paid in advance**.

Payments are append-only. Cancelling a receipt adds a reversing entry dated today, so a closed month never
changes; the correction shows in the month it was made. Imported receipts without hints are marked
*inferred* so you know the split came from the rule rather than the receipt.

### Fee recovery

* **Families.** A parent profile is keyed by a unique phone number (digits only; `+91` and a leading 0 are
  ignored). A student is linked to the profile of their phone number when they are added, imported or their number
  changes; a new number creates a profile named after the father (or mother). Two profiles of one family can be
  merged (the other number becomes the alternate phone, so later admissions with it join too), and a student
  admitted under another number can be moved into the family by hand. Family amounts are the children's
  `student_balances` added up (Balance, Due now and Old balance; *to recover* = Due now + Old balance).
* **Promises.** A call (or a student note) can carry a date and an amount the family promised to pay by. It is
  **kept** when the family (any child) pays the amount (or anything, when no amount was given) between the call and
  the date plus the *grace days* in Settings (default 1: promised for the 18th, paid on the 19th is kept),
  **partly kept** when less arrived, **broken** when nothing did, and **waiting** until then.
* **Calls.** Every call says what it was about: fees, the student's studies or report, a parent-teacher meeting,
  a parent's question, or something else. What the family said about fees and a promise are recorded on fee calls.
* **Daily call list.** Worked out afresh every day from the rules in Settings: every family with at least the
  minimum to recover (default ₹500, Due now + Old balance), except families who paid in the last *N* days (default 30: a
  family that paid ₹15,000 two weeks ago is not called even if it still owes ₹35,000), families waiting for a promise
  (until the promised date plus the grace days) and families called recently (after a fee call that got through,
  *days between calls*, default 7; after one that did not, the next day; or the date they asked to be called on).
  A broken promise puts the family back the day after its deadline, whatever it paid before. Priority: broken
  promises and call-backs first, then the larger amounts to recover, the longer time since the last payment and
  old balance; families who can pay
  (economic condition, payment habit) move up and families that cannot be reached move down. Callers take families
  from it (a fee call made today also puts the family on the caller's list); untaken families stay for anyone.
* **What brought a payment in.** At the fee counter the accountant ticks the call (to the family, in the last 30
  days) or the activity (of the student) that brought the payment in; a fee call that got through in the last week,
  or whose promise is still running, is ticked by default. It can be changed on the receipt. Each receipt counts
  for one thing. These ticks split the money on the recovery dashboard into *after a call*, *from an activity* and *paid on
  their own*, and give each caller and each activity the money it brought in.
* **Does calling make a difference.** Of the families we spoke to about fees in the period, the share that paid on
  or after the call; of the other families with fees due (the minimum to recover now, or who paid fees due now in
  the period), the share that paid fees due now.
* **Activities.** An activity is *working well* when half or more of its families with fees due (paid since it
  started, or something to recover now) paid because of it (a receipt counted for it) or its target is reached; *some effect* from a quarter;
  *not working* below that; *too early* in its first week while nothing is counted.

### Consistency checks

`Admin › Reconciliation` runs these live for any session: sum of class balances = school balance; sum of
monthly received = session received; installments received + old balance received + paid in advance = total
received; every payment fully allocated; no fee line over-collected; enrolled students without fees assigned.

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
| Home | `GET /api/home/fees?session`, `GET /api/home/today`, `GET /api/home/chase`, `GET /api/home/classes?session` (one per card) |
| Analytics | `GET /api/analytics/dashboard`, `defaulters`, `balances`, `classes`, `classes/[id]`, `months/[month]` (+ `/payments`, `/non-payers`, `/classes/[classId]`), `installments`, `installments/[number]`, `reconciliation` |
| Students | `GET/POST /api/students`, `GET /api/students/search`, `GET/PUT/DELETE /api/students/[id]`, `…/360`, `…/dues`, `…/fees`, `…/withdraw`, `…/reactivate`, `…/notes`, `…/charges`, `…/charges/generate`, `…/concessions`, `…/opening-dues` |
| Money | `GET/POST /api/payments` (a payment can be counted for a call or an activity), `GET /api/payments/[id]`, `POST /api/payments/[id]/cancel`, `PUT /api/payments/[id]/source`, `GET/POST /api/targets`, `GET/DELETE /api/targets/[id]` |
| Recovery | `GET /api/recovery?from&to` (dashboard), `GET /api/calls` (today's list), `POST /api/calls/take`, `POST /api/calls/release`, `GET/POST /api/parents`, `POST /api/parents/link`, `GET/PUT/DELETE /api/parents/[id]` (+ `/children`, `/merge`, `/calls`, `/calls/[callId]`), `GET/POST /api/activities`, `GET/PUT/DELETE /api/activities/[id]` (+ `/participants`, `/participants/[participantId]`), `GET /api/students/[id]/recovery`, `GET /api/families/search?q`, `GET /api/promises`, `PUT /api/settings/call-rules` |
| Setup | `/api/sessions` (+ `/[id]`, `/current`, `/installments`), `/api/installments/[id]`, `/api/classes`, `/api/fee-heads`, `/api/fee-structure` (+ `/copy`, `/apply`), `/api/promote`, `POST /api/imports/[kind]`, `GET /api/setup/checklist`, `GET /api/setup/classes` |
| Admin | `/api/settings` (+ `/allocation-rule`, `/promise-grace`), `/api/staff` (+ `/[id]`, `/[id]/password`), `POST /api/admin/reallocate`, `POST /api/months/[month]/close` and `/reopen`, `GET /api/admin/snapshots`, `GET /api/admin/audit` |

Money is integer paise in every request and response; dates are `YYYY-MM-DD`. Errors come back as
`{ "error": "…" }` with a status code (400 invalid, 401 not signed in, 403 role, 404, 409 conflict). A caller
gets 403 from every endpoint except the calling ones (the call list, a family, a student's profile, Find a
family, Promises, logging a call, notes, activity responses).

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
npm run db:reset              # creates the schema + loads demo data (2 sessions, ~340 students, calls and activities)
npm run dev                   # http://localhost:3000
```

Demo login: **admin@school.test** / **admin12345**. The same password signs in **neha@school.test**
(accountant), **ravi@school.test** (principal) and **pooja@school.test** (caller, 8 families on today's list).

Database scripts (they read `DATABASE_URL` from the environment or `.env.local`):

| Script | What it does |
| --- | --- |
| `npm run db:migrate` | Applies new files from `db/migrations`, in order, once each (tracked in `schema_migrations`). |
| `npm run db:seed` | Loads the demo data (local only). |
| `npm run db:reset` | Drops everything, migrates and seeds. Refuses non-local databases unless you add `-- --force`. |
| `npm run db:test` | pgTAP tests for the allocation engine, security, reconciliation, fee recovery, the Caller role and the Home figures (needs the `pgtap` extension, e.g. `apt install postgresql-17-pgtap`). |
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
   types → fee structure → import or add students (with class) → assign fees to students → import the old
   balance and old receipts if you have them → start collecting.

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
| Accountant | Collect fees, cancel receipts, edit students and fee data, imports, reconciliation, parent profiles, student activities, what brought a payment in. Calls parents. |
| Principal | Sees Home, the reports and every class, student and parent view (read-only). Calls parents from the daily list. Cannot change fees. |
| Caller | Only calls families: lands on *My calls* (`/calls`, My list open) and sees just My calls, Find a family and Promises. Takes families from the list, logs calls, adds notes, records a family's response to an activity, and sees each family's full profile and each student's profile read-only. No Home, reports or school totals, no collecting or changing fees, no editing students or parents, no exports, no Setup or Settings. A blocked page shows "You don't have access to this page" with a link back to My calls, and the API and the SQL functions refuse the action as well. |
| Class teacher | Reserved for a later release (own class only); currently no data access. |

Access is checked by the API on every request and again inside every SQL function (and by row-level security
when the app connects as a least-privilege role), not just in the UI. Writes to payments are only possible
through the `collect_payment` / `cancel_payment` functions; every payment, cancellation, import, month close,
role change and password reset is written to the audit log. Sign-in attempts are rate limited, sessions end
after 7 days without use (30 days at most), and signing out ends the session on the server.

## Project layout

```
db/
  migrations/   schema + RLS, allocation engine, operations, analytics, app access, fee recovery, daily calls,
                the Caller role, Home
  seed.sql      deterministic demo data (local only)
  tests/        pgTAP tests (npm run db:test)
scripts/db.mjs  migrate / seed / reset / test / create-user / set-password
src/
  app/api/      the REST API (route handlers)
  app/(app)/    signed-in screens (home, monthly, installments, classes, students, collect, payments,
                pending = Fees due, reports, parents, recovery, calls, find, promises, activities, setup,
                settings, admin);
                each page renders a
                client view that loads its data from the API
  app/login     sign in
  server/       backend only: database pool, auth, cache, validation, services
  components/   UI kit, charts, layout (app shell, sidebar, search, session switcher)
  lib/          shared types, formatting (money is integer paise), roles, glossary (the money words);
                lib/api = browser API client
```

See `AGENTS.md` for coding conventions.
