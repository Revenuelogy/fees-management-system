# School Fees Management & Analytics

Fee collection, receipts and a deep analysis layer that answers one question for the school owner:
**where exactly is my fee money?** What should have come, what has come, what is stuck, and which
class or student is holding it back, at the level of session, month, installment, class and single student.

Built with **Next.js 16** (App Router) and **PostgreSQL** (any PostgreSQL 13+ server: local, Docker, RDS,
Cloud SQL, Neon, Supabase…). Staff sign in with a role: admin, accountant, principal or caller (class teacher is
reserved for later).

Every page uses the same plain money words (see *How the numbers work*): **Total fees this year**, **Received this
year**, **Remaining this year**, **Due till today**, **Due later**, **Previous years' dues**, **Total fees incl. previous
years**, **Remaining incl. previous years** and **Total due incl. previous years** (= due till today + previous years' dues).

## What you can do

| Area | Screen | What it shows |
| --- | --- | --- |
| Analysis | **Home** (`/`) | The whole school on one screen, numbers first, for the owner or principal opening the app each day. **Fees** for the year in two rows: this year (total fees, received, remaining, due till today, with one bar split into received / due till today / due later) and including previous years (previous years' dues, total fees incl. previous years, remaining incl. previous years, total due incl. previous years). **What happened** today, yesterday, in the last 7 or 30 days: the money that came in (against the period before) and where it came from (after a call, from an activity, paid on their own; this year / previous years / paid in advance), the calls made (picked up, promises to pay, money after calls, and today's list: families to call, broken promises, promises due today), the activities running (students taking part, money because of them, the best ones). **School**: students, families, classes and students by status. **Classes**: each class's share of its total fees received, received of total, and what is due till today (red under 30%, amber to 49%, green from 50%). Every figure opens the page behind it; each card loads on its own. |
| | **Months** (`/monthly`) | Any month: the fees due this month (or everything due so far), received this month and due till today, each class's % of what was due this month and of how much, students who paid / owe fees and paid nothing this month, what the money paid for (this year / previous years / paid in advance), daily and running-total charts, class contribution, payment modes. Past months use the same layout; closed months are frozen snapshots. |
| | **Month › class** (`/monthly/2026-09/<class>`) | Every student of the class in that month: received this month, *what it paid for* (session, installment, fee type), % of what they had left that it cleared, what is left now, status. Paid / not-paid filter. Totals match the month page. |
| | **Installments** (`/installments`) | Each installment's total, received and what is left (due till today once its date has passed, due later before that), received on time / late / remaining, collection targets ("90% of fees due by 31 Dec") with the students who would make up the shortfall. |
| | **Installment detail** (`/installments/2`) | What is left by class (out of each class's total), by student group (paid full / >½ / <½ / nothing), the smallest set of students holding half of it ("call these first"), when payments came compared with the due date, late catch-up. |
| | **Classes** / **Class view** | Each class's received of total fees, remaining this year, due till today and previous years' dues; one class (or section): every total of the year (this year, previous years, both together), students by status, each installment's total / received / what is left, month strip (click into month › class), paid-% bands, and a student table with each student's totals. |
| | **Student 360** (`/students/<id>`) | In plain words: total fees (incl. previous years when there are some), received, last payment and where it went ("It went to last year's dues"), remaining. Installment ladder, payment history with what each receipt paid for, fees by session, payment habit, notes and promised dates. |
| Fees | **Collect fee** (`/collect`, also in the phone top bar) | Type-ahead search (name, admission no, father, phone; Ctrl+K anywhere). Shows the fees due, oldest first; automatic allocation preview or choose exactly what the payment covers (*Pay what is due till today* / *Pay everything remaining*); cash / UPI / cheque / bank / card with references; saves and opens the receipt. |
| | **Receipt** (`/payments/<id>`) | Printable receipt (single or parent + office copy), amount in words, what each rupee paid for, what was left to pay before/after. Cancel with a reason (creates a reversing entry, original stays on record). |
| | **Payments & receipts** | Register by date range split into this year / previous years / paid in advance, mode totals, search by receipt or cheque/UTR, CSV export. |
| | **Fees due** (`/pending`) | Everyone with fees due: total fees this year, remaining this year or due till today, previous years' dues as their own column, total due incl. previous years, days since last payment; has-previous-years'-dues and left-school views; filter by class, section, status; CSV and print. |
| | **Owner report** (`/reports/summary`) | One page: every total of the year (this year, previous years, both together), this month, remaining by class (with each class's total), top 10 by due till today, month by month. Print / save as PDF, share on WhatsApp or email. |
| Recovery | **Parents** (`/parents`) | Every family as one parent profile (found by phone number, so brothers and sisters share it) with the children's fees added up: total fees this year, remaining, due till today, previous years' dues, total due incl. previous years, days since last payment, family status, last call and open promise. Total due grouped by payment habit and by economic condition. |
| | **Parent 360** (`/parents/<id>`) | The family in one place, the important part on the first screen: who they are (status, payment habit, means, best time, the last call and the latest promise), total fees / received / remaining (incl. previous years when there are some) / last payment, each child with their totals, and what the staff know about the family (concerns, what matters to them, how they behave). Below: the call history with how each promise turned out, every receipt, how reliably they keep promises, payment habit (recorded next to what the records show), fees by year and activities. **Log a call** opens the call form in a panel from the right. |
| | **Recovery dashboard** (`/recovery`) | For today, yesterday, 7 or 30 days (the default), the school year or any dates: the money received and what brought it in (a call, an activity, or the family on its own), compared with the period before; money per day by source; the recovery work going on (calls made, money after calls, activities running, money from activities); which activity brought the most. The call analytics are on Calls. |
| | **Calls** (`/calls`), for admin, accountant and principal | **Overview** for today, yesterday, 7 or 30 days: calls made (against the period before), picked up, promised to pay, promises kept, money that came in after calls; calls per day; how the calls went and what families said; **does calling make a difference** (share of families we spoke to who paid against the other families with fees due); promises and how they turned out; who called the most; what the calls were about. **Callers**: every caller's effort (calls, families, days calling, calls a day) next to the result (picked up, promises kept, money after their calls, money per call). **Today's list**: the list below, with *Give to…* on each family. **Assign families**: give any family, on the day's list or not, to a caller for today or a later day with a note; see each caller's families for any day and take families off. |
| | **Calls** (`/calls`), for callers | The daily call list, made fresh every day and ordered by priority, each family with its main reason (broke a promise, asked to call today, large amount due, never paid, no payment for 2 months, previous years' dues…) and the total due. Each caller takes a batch (*Give me 10 families*) or picks families, gets the families the office gives them (first on the list, marked *Given by …* with the note), and sees **my list** (to call / done), **everyone to call** (with who took whom) and **called today** (every call, about anything). My calls today / yesterday / 7 / 30 days: calls, picked up, not reached, promises, money that came in after them. Also promises falling due, who is off the list and why, and what each caller did today. **Family call page** (`/calls/<parent>`): one-tap dial, why the family is on the list, and everything about the family read-only (family, each child's total fees / remaining / due till today / previous years' dues, installments, receipts, promises, activities with the family's response, call history, notes) next to the call form with *Save & next family*. |
| | **Find a family** (`/find`), **Promises** (`/promises`) | Search families by a parent's or child's name, admission number or phone; every open promise, soonest date first. Made for callers, open to all staff. |
| | **Activities** (`/activities`) | Every student activity (extra English practice, a club, a trip for students whose fees are paid…) with a verdict (working well / some effect / not working), the fees received because of it, "N of M families paid", responses, and when it runs ("Starts in 15 days", "Ended 26 Oct"); also by class and by student. **Activity** (`/activities/<id>`): add a class or students, record each family's response and count receipts for it. On a student's profile, **Recovery activities** starts an activity for that student alone or adds them to a running one. |
| Setup | Sessions & installments, classes & fee types, fee structure grid and assigning fees to students, promote students to the next session, CSV imports (students, previous years' dues, historical payments). |
| Admin | School settings, allocation rule and promise grace days, staff & roles, reconciliation checks, re-run allocation, close/reopen months, audit log. |

Every table can be sorted, searched and exported to CSV (Excel) with the filters written into the file.

## How the numbers work

Two tables feed every number, which is why the parts always add up to the totals:

* **`student_charges`** – what each student must pay, per installment and fee type, after concessions (*total fees*).
* **`allocations`** – what each payment paid for (*Received*). A payment of ₹10,000 can become ₹4,000
  against the 2025-26 dues and ₹6,000 against Installment 1 of 2026-27.

The money words, the same on every page, tooltip, CSV export and printout (`src/lib/glossary.ts`). Each says what it
is when read on its own:

| Word | Meaning |
| --- | --- |
| Session | One academic year, normally 1 April – 31 March (e.g. 2026-27). |
| Total fees this year | What students must pay for this year (fees of the session after concessions). |
| Received this year | Money received against this year's fees (whenever it was paid). |
| Remaining this year | This year's fees not received yet: due till today + due later. |
| Due till today | This year's installments whose due date has passed and are not paid. |
| Due later | This year's installments whose due date has not come yet. |
| Previous years' dues | Fees of previous years still unpaid. *Received for previous years* = paid during this year. |
| Total fees incl. previous years | This year's fees + what was left unpaid from previous years when this year started. |
| Remaining incl. previous years | Remaining this year + previous years' dues. |
| Total due incl. previous years | Due till today + previous years' dues. |
| Paid in advance | Money not yet matched to any fee (used automatically as new fees are assigned). |

Previous years' dues are always their own figure or column, never added silently into a this-year figure, and every
part or % on screen is shown with the total it belongs to. The school's, a class's or a section's totals all come
from `fee_position()`.

**Status tags** (live, per student, the same on every page; hover or tap one for its meaning): *Paid up*
(green: nothing due till today and nothing left from previous years), *Part paid* (blue), *Nothing paid this
year* (red), *Previous years' dues only* (amber: this year fully paid, previous years still unpaid), *Free* (grey).

### Payment allocation rule

Applied to each payment in date order, and re-run automatically whenever charges, concessions or rules change:

1. Lines chosen at the counter ("choose what it pays for") or saved from the automatic preview.
2. Hints on imported receipts (session / fee type / installment named by the old ERP).
3. Default rule (Settings): **oldest fees first** – previous years' dues, then the earliest installment,
   then fee types in priority order; or **this year first**, then previous years.
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
  `student_balances` added up (remaining, due till today and previous years' dues; *total due* = due till today + previous years' dues).
* **Promises.** A call (or a student note) can carry a date and an amount the family promised to pay by. It is
  **kept** when the family (any child) pays the amount (or anything, when no amount was given) between the call and
  the date plus the *grace days* in Settings (default 1: promised for the 18th, paid on the 19th is kept),
  **partly kept** when less arrived, **broken** when nothing did, and **waiting** until then.
* **Calls.** Every call says what it was about: fees, the student's studies or report, a parent-teacher meeting,
  a parent's question, or something else. What the family said about fees and a promise are recorded on fee calls.
* **Daily call list.** Worked out afresh every day from the rules in Settings: every family with at least the
  minimum total due (default ₹500, due till today + previous years' dues), except families who paid in the last *N* days (default 30: a
  family that paid ₹15,000 two weeks ago is not called even if it still owes ₹35,000), families waiting for a promise
  (until the promised date plus the grace days) and families called recently (after a fee call that got through,
  *days between calls*, default 7; after one that did not, the next day; or the date they asked to be called on).
  A broken promise puts the family back the day after its deadline, whatever it paid before. Priority: broken
  promises and call-backs first, then the larger amounts due, the longer time since the last payment and
  previous years' dues; families who can pay
  (economic condition, payment habit) move up and families that cannot be reached move down. Callers take families
  from it (a fee call made today also puts the family on the caller's list); untaken families stay for anyone.
* **Giving families to callers.** Admin, accountant and principal can give any family, on the day's list or not, to
  anyone who makes calls, for today or a day in the next 60 days, with a note. That day the family is first on the
  caller's list ("Given by …"), whatever the rules would say; the caller (or the office) can take it off again.
* **What brought a payment in.** At the fee counter the accountant ticks the call (to the family, in the last 30
  days) or the activity (of the student) that brought the payment in; a fee call that got through in the last week,
  or whose promise is still running, is ticked by default. It can be changed on the receipt. Each receipt counts
  for one thing. These ticks split the money on the recovery dashboard into *after a call*, *from an activity* and *paid on
  their own*, and give each caller and each activity the money it brought in.
* **Does calling make a difference.** Of the families we spoke to about fees in the period, the share that paid on
  or after the call; of the other families with fees due (the minimum total due now, or who paid fees that were due in
  the period), the share that paid fees that were due.
* **Activities.** An activity is *working well* when half or more of its families with fees due (paid since it
  started, or something due till today) paid because of it (a receipt counted for it) or its target is reached; *some effect* from a quarter;
  *not working* below that; *too early* in its first week while nothing is counted.

### Consistency checks

`Admin › Reconciliation` runs these live for any session: sum of class balances = school balance; sum of
monthly received = session received; installments received + received for previous years + paid in advance = total
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
| Home | `GET /api/analytics/position?session[&class&section]` (every total of the year), `GET /api/home/fees?session`, `GET /api/home/today`, `GET /api/home/classes?session`, `GET /api/recovery?from&to` (one per card) |
| Analytics | `GET /api/analytics/dashboard`, `defaulters`, `balances`, `classes`, `classes/[id]`, `months/[month]` (+ `/payments`, `/non-payers`, `/classes/[classId]`), `installments`, `installments/[number]`, `reconciliation` |
| Students | `GET/POST /api/students`, `GET /api/students/search`, `GET/PUT/DELETE /api/students/[id]`, `…/360`, `…/dues`, `…/fees`, `…/withdraw`, `…/reactivate`, `…/notes`, `…/charges`, `…/charges/generate`, `…/concessions`, `…/opening-dues` |
| Money | `GET/POST /api/payments` (a payment can be counted for a call or an activity), `GET /api/payments/[id]`, `POST /api/payments/[id]/cancel`, `PUT /api/payments/[id]/source`, `GET/POST /api/targets`, `GET/DELETE /api/targets/[id]` |
| Recovery | `GET /api/recovery?from&to` (money and what brought it in, calls made, activities), `GET /api/calls` (today's list), `POST /api/calls/take`, `POST /api/calls/release`, `GET /api/calls/analytics?from&to`, `GET /api/calls/assignments?date`, `POST /api/calls/assign`, `POST /api/calls/unassign`, `GET/POST /api/parents`, `POST /api/parents/link`, `GET/PUT/DELETE /api/parents/[id]` (+ `/children`, `/merge`, `/calls`, `/calls/[callId]`), `GET/POST /api/activities`, `GET/PUT/DELETE /api/activities/[id]` (+ `/participants`, `/participants/[participantId]`), `GET /api/students/[id]/recovery`, `GET /api/families/search?q`, `GET /api/promises`, `PUT /api/settings/call-rules` |
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
| Principal | Sees Home, the reports and every class, student and parent view (read-only), and the call analytics. Calls parents from the daily list and gives families to callers. Cannot change fees. |
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
                the Caller role, Home, dashboards and giving families to callers, fee position
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
