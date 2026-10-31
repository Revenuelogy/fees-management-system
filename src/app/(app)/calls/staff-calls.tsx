"use client";

import { BarChart3, ListChecks, UserPlus, UsersRound } from "lucide-react";
import { useApi } from "@/lib/api/hooks";
import { type SearchParams, param } from "@/lib/context";
import { QUICK_PERIODS, resolvePeriod, type Period } from "@/lib/period";
import { todayIST } from "@/lib/format";
import type { CallAnalytics, CallAssignments } from "@/lib/types";
import { Pending } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { CallBoardView } from "./calls-view";
import { CallersView, CallsOverview } from "./call-analytics";
import { AssignPanel } from "./assign-panel";

const VIEWS = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "callers", label: "Callers", icon: UsersRound },
  { key: "list", label: "Today's list", icon: ListChecks },
  { key: "assign", label: "Assign families", icon: UserPlus },
] as const;
type View = (typeof VIEWS)[number]["key"];

/**
 * Calls for the people who run the calling (admin, accountant, principal): how calling is going (Overview), every
 * caller's effort and result (Callers), today's list with who has which family (Today's list) and giving any family
 * to a caller for a day (Assign families). Callers see only their own list (CallsView).
 */
export function StaffCalls({ sp }: { sp: SearchParams }) {
  const view: View = VIEWS.find((v) => v.key === param(sp.view))?.key ?? "overview";
  const today = todayIST();
  const period = resolvePeriod(param(sp.period), undefined, undefined, today, null, "7d");
  const withPeriod = view === "overview" || view === "callers";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calls"
        description="How calling is going, who is calling, and who has which families."
        info="Callers see only their own list. Here you see every call, every caller's effort and result, and you can give any family to a caller for a day."
      >
        <Segmented
          options={VIEWS.map((v) => ({
            label: v.label,
            href: withParams("/calls", { view: v.key === "overview" ? undefined : v.key, period: withPeriod && v.key !== "list" && v.key !== "assign" ? param(sp.period) : undefined }),
            active: v.key === view,
          }))}
        />
        {withPeriod && (
          <Segmented
            options={QUICK_PERIODS.map((p) => ({
              label: p.label,
              href: withParams("/calls", { view: view === "overview" ? undefined : view, period: p.key === "7d" ? undefined : p.key }),
              active: p.key === period.key,
            }))}
          />
        )}
      </PageHeader>

      {view === "overview" && <Analytics period={period} render={(d) => <CallsOverview d={d} period={period} />} />}
      {view === "callers" && <Analytics period={period} render={(d) => <CallersView d={d} period={period} />} />}
      {view === "list" && <ListWithCallers tab={param(sp.tab)} />}
      {view === "assign" && <AssignPanel date={param(sp.date)} callerId={param(sp.caller)} />}
    </div>
  );
}

function Analytics({ period, render }: { period: Period; render: (d: CallAnalytics) => React.ReactNode }) {
  const res = useApi<CallAnalytics>(withParams("/api/calls/analytics", { from: period.from, to: period.to }));
  if (!res.data) return <Pending queries={[res]} />;
  return <>{render(res.data)}</>;
}

/** Today's list, with "Give to…" on each family (the people who make calls come with today's assignments). */
function ListWithCallers({ tab }: { tab?: string }) {
  const res = useApi<CallAssignments>("/api/calls/assignments");
  return <CallBoardView tab={tab} embedded callers={res.data?.callers.map((c) => ({ user_id: c.user_id, name: c.name }))} />;
}
