"use client";

import { param, type SearchParams } from "@/lib/context";
import { useApi } from "@/lib/api/hooks";
import type { FeeHead } from "@/lib/types";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { IMPORT_KINDS, IMPORT_SPECS, type ImportKind } from "@/lib/import-columns";
import { ImportPanel } from "./import-panel";

export function ImportView({ sp }: { sp: SearchParams }) {
  const { sessions, session: active, classes } = useApp();
  const requested = param(sp.tab);
  const tab: ImportKind = IMPORT_KINDS.includes(requested as ImportKind) ? (requested as ImportKind) : "students";
  const headsRes = useApi<FeeHead[]>("/api/fee-heads", { refreshInterval: 0 });
  if (!headsRes.data) return <Pending queries={[headsRes]} />;

  return (
    <>
      <PageHeader
        title="Import data"
        description="Students first, then previous years' dues and past payments."
        info="Bring in students, the dues left from previous years and past payments from CSV spreadsheets."
      >
        <Segmented
          label="Import"
          options={IMPORT_KINDS.map((k) => ({ label: IMPORT_SPECS[k].label, href: `/setup/import?tab=${k}`, active: k === tab }))}
        />
      </PageHeader>
      <ImportPanel
        key={tab}
        kind={tab}
        sessions={sessions.map((s) => ({ id: s.id, name: s.name }))}
        activeSessionId={active?.id ?? null}
        classNames={classes.map((c) => c.name)}
        headNames={headsRes.data.map((h) => h.name).sort((a, b) => a.localeCompare(b))}
      />
    </>
  );
}
