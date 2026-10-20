"use client";

import { Trash2 } from "lucide-react";
import { useApi } from "@/lib/api/hooks";
import type { CampaignDetail } from "@/lib/types";
import { RequireRole, useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { useFormAction } from "../../../setup/_lib/use-form-action";
import { deleteCampaign } from "../../actions";
import { CampaignForm } from "../../campaign-form";

export function EditCampaign({ id }: { id: string }) {
  return (
    <RequireRole role="writer">
      <Editor id={id} />
    </RequireRole>
  );
}

function Editor({ id }: { id: string }) {
  const { classes } = useApp();
  const res = useApi<CampaignDetail>(`/api/recovery/campaigns/${id}`, { refreshInterval: 0, revalidateOnFocus: false });
  if (!res.data) return <Pending queries={[res]} />;
  const d = res.data;
  const used = d.kind === "calls" ? d.stats.calls > 0 : d.stats.credited_receipts > 0;
  return (
    <>
      <PageHeader title={d.campaign.name} crumbs={[{ label: "Fee recovery", href: "/recovery" }, { label: d.campaign.name, href: `/recovery/${id}` }, { label: "Edit" }]} />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <CampaignForm kind={d.kind} campaign={d.campaign} classes={classes} today={d.today} graceDays={d.grace_days} />
        </div>
        <DeleteCard id={id} used={used} />
      </div>
    </>
  );
}

function DeleteCard({ id, used }: { id: string; used: boolean }) {
  const { state, pending, onSubmit } = useFormAction(deleteCampaign);
  return (
    <Card title="Delete">
      {used ? (
        <p className="text-footnote text-ink-2">It already has calls or credited receipts. Set its status to Closed instead, so the results stay on record.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          <p className="text-footnote text-ink-2">Nothing has been recorded in it yet.</p>
          <FormError message={state.error} />
          <Button type="submit" variant="danger" disabled={pending} data-confirm="Delete this campaign?">
            <Trash2 className="size-4" /> {pending ? "Deleting…" : "Delete"}
          </Button>
        </form>
      )}
    </Card>
  );
}
