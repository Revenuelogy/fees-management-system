import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/context";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import type { Profile } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddStaffForm, RoleForm } from "./staff-forms";

export const metadata = { title: "Staff & roles" };

const ROLE_HELP: { role: string; title: string; text: string }[] = [
  { role: "admin", title: "Owner / Director (admin)", text: "Everything: fees, data, school settings, staff logins, closing months and re-running allocation." },
  { role: "accountant", title: "Accountant", text: "Collects fees, issues and cancels receipts, edits students and fee data, sees analytics and reconciliation." },
  { role: "principal", title: "Principal", text: "Read-only: dashboards, analytics, pending fees and reports. Cannot collect fees or change data." },
  { role: "teacher", title: "Teacher", text: "Reserved for class-scoped access (own class only), coming later. Currently has no access to fee data." },
];

function fmtWhen(iso: string | null | undefined, tz: string) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-IN", { timeZone: tz, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function StaffPage() {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("*").order("created_at");
  if (error) throw new Error(error.message);
  const profiles = (data ?? []) as Profile[];

  // Last sign-in is only visible through the auth admin API (service key).
  const admin = createAdminClient();
  const lastSignIn = new Map<string, string | null>();
  if (admin) {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of users?.users ?? []) lastSignIn.set(u.id, u.last_sign_in_at ?? null);
  }
  const tz = (await getSettings())?.timezone ?? "Asia/Kolkata";
  const waiting = profiles.filter((p) => !p.role).length;

  return (
    <>
      <PageHeader
        title="Staff & roles"
        crumbs={[{ label: "School settings", href: "/settings" }, { label: "Staff & roles" }]}
        description="Who can sign in and what each person can do. New logins get no access until you give them a role."
      />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card
          title="Staff logins"
          description={
            waiting > 0
              ? `${waiting} ${waiting === 1 ? "login is" : "logins are"} waiting for a role.`
              : `${profiles.length} ${profiles.length === 1 ? "login" : "logins"}`
          }
        >
          <div className="relative overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13.5px]">
              <thead className="bg-surface-2 text-[12px] uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Name</th>
                  <th scope="col" className="px-3 py-2 font-medium">Role</th>
                  <th scope="col" className="px-3 py-2 font-medium">Added</th>
                  {admin && <th scope="col" className="px-3 py-2 font-medium">Last sign-in</th>}
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="border-t border-line align-top">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-ink">{p.full_name || "—"}</span>
                      {p.role === "admin" && (
                        <Badge tone="accent" className="ml-2">
                          admin
                        </Badge>
                      )}
                      {!p.role && (
                        <Badge tone="warning" className="ml-2">
                          waiting for a role
                        </Badge>
                      )}
                      <span className="block text-[12.5px] text-muted">{p.email}</span>
                    </td>
                    <td className="px-3 py-2">
                      <RoleForm key={p.id} id={p.id} role={p.role} isSelf={p.id === viewer.user.id} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-ink-2">{fmtDate(p.created_at)}</td>
                    {admin && <td className="whitespace-nowrap px-3 py-2.5 text-ink-2">{fmtWhen(lastSignIn.get(p.id), tz)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Add staff login">
            {admin ? (
              <AddStaffForm />
            ) : (
              <div className="space-y-2 text-[13px] text-ink-2">
                <p>
                  Logins can be created here once the server has the Supabase secret key. Set <code className="rounded bg-surface-3 px-1">SUPABASE_SECRET_KEY</code>{" "}
                  (the <i>secret</i> / service-role key from Supabase → Project Settings → API keys) in the server environment and restart the app.
                </p>
                <p>
                  Or add the user yourself in the Supabase dashboard: <b>Authentication → Users → Add user</b> (tick &ldquo;Auto confirm&rdquo;).
                  They then appear in the list here with no access — choose their role.
                </p>
              </div>
            )}
          </Card>

          <Card title="What each role can do">
            <dl className="space-y-3">
              {ROLE_HELP.map((r) => (
                <div key={r.role}>
                  <dt className="text-[13.5px] font-medium text-ink">{r.title}</dt>
                  <dd className="text-[13px] text-ink-2">{r.text}</dd>
                </div>
              ))}
              <div>
                <dt className="text-[13.5px] font-medium text-ink">No access</dt>
                <dd className="text-[13px] text-ink-2">Can sign in but sees nothing. Use it to switch off someone who has left.</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
