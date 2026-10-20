"use client";

import { useApi } from "@/lib/api/hooks";
import type { CampaignDetail } from "@/lib/types";
import { Pending } from "@/components/ui/page-state";
import { ActivityView } from "./activity-view";
import { CallsView } from "./calls-view";

/** A call campaign (its call list and results) or a student activity (participants and receipts). */
export function CampaignView({ id, tab }: { id: string; tab?: string }) {
  const res = useApi<CampaignDetail>(`/api/recovery/campaigns/${id}`);
  if (!res.data) return <Pending queries={[res]} />;
  return res.data.kind === "calls" ? <CallsView d={res.data} tab={tab} /> : <ActivityView d={res.data} tab={tab} />;
}
