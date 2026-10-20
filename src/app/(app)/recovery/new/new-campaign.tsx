"use client";

import { todayIST } from "@/lib/format";
import type { CampaignKind } from "@/lib/types";
import { RequireRole, useApp } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { CampaignForm } from "../campaign-form";

export function NewCampaign({ kind }: { kind: CampaignKind }) {
  const { classes, settings } = useApp();
  const title = kind === "calls" ? "New call campaign" : "New student activity";
  return (
    <RequireRole role="writer">
      <PageHeader
        title={title}
        crumbs={[{ label: "Fee recovery", href: "/recovery" }, { label: title }]}
        description={kind === "calls" ? "Pick the families to call; the list updates itself every day." : "An activity for students that also helps bring fees in."}
        info={
          kind === "calls"
            ? "Staff open the call list, call each family and log what was said. Promises are tracked automatically against the payments."
            : "For example extra English practice for a student who needs it, or a class trip open to students whose fees are paid. The accountant marks which receipts came in because of it."
        }
      />
      <CampaignForm kind={kind} classes={classes} today={todayIST()} graceDays={settings.promise_grace_days} />
    </RequireRole>
  );
}
