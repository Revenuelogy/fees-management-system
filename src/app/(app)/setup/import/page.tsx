import { requireWriter } from "@/lib/auth";
import { getActiveSession, getClasses, getSessions, param } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { IMPORT_KINDS, IMPORT_SPECS, type ImportKind } from "./columns";
import { ImportPanel } from "./import-panel";

export const metadata = { title: "Import data" };

export default async function ImportPage({ searchParams }: PageProps<"/setup/import">) {
  await requireWriter();
  const sp = await searchParams;
  const requested = param(sp.tab);
  const tab: ImportKind = IMPORT_KINDS.includes(requested as ImportKind) ? (requested as ImportKind) : "students";

  const supabase = await createClient();
  const [sessions, active, classes, headsRes] = await Promise.all([
    getSessions(),
    getActiveSession(),
    getClasses(),
    supabase.from("fee_heads").select("name").order("name"),
  ]);

  return (
    <>
      <PageHeader
        title="Import data"
        description="Students first, then old dues and past payments."
        info="Bring in students, dues carried over from earlier years and past payments from CSV spreadsheets."
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
        headNames={((headsRes.data ?? []) as { name: string }[]).map((h) => h.name)}
      />
    </>
  );
}
