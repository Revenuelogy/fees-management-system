"use client";

import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";
import { useApi } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { fmtDate, rupees, rupeesShort } from "@/lib/format";
import { fmtPhone } from "@/lib/recovery";
import type { OpenPromises } from "@/lib/types";
import { Pending } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";

/** Every family's open promise to pay, soonest date first. Unpaid after the date (and the grace days), the family is back on the call list. */
export function PromisesView() {
  const res = useApi<OpenPromises>("/api/promises");
  if (!res.data) return <Pending queries={[res]} />;
  const d = res.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Promises"
        description={`${d.promises.length} open ${d.promises.length === 1 ? "promise" : "promises"}, soonest date first.`}
        info={`A promise is kept when the family pays by the promised date, or within ${d.grace_days} grace ${d.grace_days === 1 ? "day" : "days"}. If not, the family is back on the call list the next day.`}
      />
      {d.promises.length === 0 ? (
        <Card>
          <Empty title="No open promises" icon={CalendarClock}>
            Promises made on calls or in notes show here until their date.
          </Empty>
        </Card>
      ) : (
        <Card bodyClassName="p-2 sm:p-3">
          <ul className="divide-y divide-line">
            {d.promises.map((p) => (
              <li key={p.parent_id}>
                <Link href={`/calls/${p.parent_id}`} className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-3 hover:bg-fill-2">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-subhead font-semibold text-ink">{p.name}</span>
                      <Badge tone={p.days_left <= 0 ? "critical" : p.days_left <= 2 ? "warning" : "neutral"}>
                        {p.days_left < 0 ? `${-p.days_left} ${p.days_left === -1 ? "day" : "days"} past the date` : p.days_left === 0 ? "Today" : p.days_left === 1 ? "Tomorrow" : `In ${p.days_left} days`}
                      </Badge>
                    </span>
                    <span className="block text-footnote text-ink-2">
                      {p.children.join(", ")} · {fmtPhone(p.phone)}
                    </span>
                    <span className="block text-caption text-muted">
                      {p.source === "note" ? `Note on ${p.student_name ?? "a child"}` : "Call"} on {fmtDate(p.made_on)}
                      {p.made_by_name ? ` by ${p.made_by_name}` : ""}
                      {p.paid > 0 ? ` · ${rupees(p.paid)} paid since` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-subhead font-semibold tabular text-ink">{p.promised_amount ? rupees(p.promised_amount) : "Payment"}</span>
                    <span className="block text-caption text-muted">by {fmtDate(p.promised_date)}</span>
                    <span className={cn("block text-caption tabular", p.total_overdue > 0 ? "text-critical-ink" : "text-muted")}>
                      {rupeesShort(p.total_overdue)} total due
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
