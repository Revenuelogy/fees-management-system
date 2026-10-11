import Link from "next/link";
import { Scale, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/context";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
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
        description="School details for receipts, and the rule that decides what each payment pays for. Only the owner / admin can change these."
        actions={
          <>
            <LinkButton href="/settings/staff">
              <ShieldCheck className="size-4" /> Staff & roles
            </LinkButton>
            <LinkButton href="/admin/reconciliation">
              <Scale className="size-4" /> Reconciliation
            </LinkButton>
          </>
        }
      />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <SchoolProfileForm settings={settings} />
        <div className="space-y-4">
          <AllocationRuleForm current={settings.allocation_order} />
          <Card title="Time zone">
            <p className="text-[13px] text-ink-2">
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
