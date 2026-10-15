import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { AllocationRuleForm, SchoolProfileForm } from "./settings-forms";

export const metadata = { title: "School settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSettings();
  if (!settings) throw new Error("School settings row is missing (school_settings id = 1).");

  return (
    <>
      <PageHeader
        title="School settings"
        description="Receipt details and how payments are applied."
        info="Only the owner / admin can change these."
      />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <SchoolProfileForm settings={settings} />
        <div className="space-y-4">
          <AllocationRuleForm current={settings.allocation_order} />
          <Card title="Time zone">
            <p className="text-footnote text-ink-2">
              Dates such as &ldquo;today&rdquo;, overdue status and month boundaries use <b>{settings.timezone}</b>. Sessions, installments
              and fee amounts are managed under{" "}
              <Link href="/setup" className="font-medium text-accent hover:underline">
                Setup
              </Link>
              .
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
