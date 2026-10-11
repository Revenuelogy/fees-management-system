<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project guide: School Fees Management & Analytics

Next.js 16 (App Router, Turbopack, `src/`), Supabase Postgres, Tailwind v4, Recharts.

## Golden rules
- **Money is integer paise everywhere** (DB, RPC JSON, props). Convert only at the edges:
  `rupees()` / `rupeesShort()` for display, `parseRupees()` for user input (`src/lib/format.ts`).
- **All numbers come from SQL functions** in `supabase/migrations/*` (expected = `student_charges`,
  received = `allocations`). Never recompute fee maths in TypeScript; add or extend an RPC instead.
- Payments are append-only. Corrections are reversals (`cancel_payment`). Allocations are derived
  and rebuilt automatically by triggers (`reallocate_student`).
- Writes that touch several tables go through SECURITY DEFINER RPCs with a role check. Simple
  master-data edits (classes, fee heads, installments, students, fee structure) may use direct
  table writes; RLS allows admin/accountant only.

## Layout
- `src/app/(app)/…` signed-in pages (layout adds sidebar, search, session switcher).
- `src/lib/auth.ts` `requireStaff() / requireWriter() / requireAdmin()` — call at the top of every
  page and every server action.
- `src/lib/context.ts` `getActiveSession()` (session picked in the top bar, cookie `fms_session`),
  `getSessions()`, `getClasses()`, `getSettings()`, `flag()` / `param()` for search params.
- `src/lib/types.ts` RPC result types. `src/lib/action-state.ts` `ActionState` + `friendlyError()`.
- UI kit `src/components/ui/*`: `Card`, `Kpi/KpiGrid`, `PageHeader` (with breadcrumbs), `Segmented`
  + `withParams` (URL toggles), `Button/LinkButton`, `Badge`, `FeeStatusBadge`, `Field/Input/Select/
  Textarea/FormError/FormSuccess`, `BarList/StackedBar/Legend/Meter`, `AllocLines`, `Empty`,
  `DataTable` (client; declarative columns with `type: money|pct|date|status|alloc|…`, link templates
  like `/students/{student_id}`, search, filters, totals, CSV export with filter notes).
- Charts (`src/components/charts/charts.tsx`): validated palette `--series-1/2/3` (blue current-year,
  orange previous dues, aqua advance), neutral `--series-track` for scheduled amounts. Status colours
  are reserved for fee status and always come with an icon + label.

## Mutations
Server actions live next to the page in `actions.ts` ("use server"), return `ActionState`, call
`revalidatePath()` for affected pages, and surface errors with `friendlyError()`. Client forms use
`useActionState`.

## Local dev
`npx supabase start` → copy keys into `.env.local` → `npx supabase db reset` (migrations + demo seed,
login `admin@school.test` / `admin12345`) → `npm run dev`.
