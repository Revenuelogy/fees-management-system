import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/context";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import type { Profile } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { IconTile, type TileColor } from "@/components/ui/kpi";
import { Ban, Calculator, Crown, Eye, GraduationCap, type LucideIcon } from "lucide-react";
import { AddStaffForm, RoleForm } from "./staff-forms";

export const metadata = { title: "Staff & roles" };

const ROLE_HELP: { role: string; title: string; text: string; icon: LucideIcon; color: TileColor }[] = [
  { role: "admin", title: "Owner / Director", text: "Everything, including settings and staff.", icon: Crown, color: "indigo" },
  { role: "accountant", title: "Accountant", text: "Collects fees, edits students and fees.", icon: Calculator, color: "green" },
  { role: "principal", title: "Principal", text: "View only: dashboards and reports.", icon: Eye, color: "blue" },
  { role: "teacher", title: "Teacher", text: "Coming later · no access yet.", icon: GraduationCap, color: "orange" },
  { role: "none", title: "No access", text: "Can sign in but sees nothing.", icon: Ban, color: "gray" },
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
        description="Who can sign in, and what they can do."
        info="New logins get no access until you give them a role."
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
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[640px] border-collapse text-left text-subhead">
              <thead className="text-caption font-medium text-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pl-5 pr-3 font-medium sm:pl-6">Name</th>
                  <th scope="col" className="px-3 py-2 font-medium">Role</th>
                  <th scope="col" className="px-3 py-2 font-medium">Added</th>
                  {admin && <th scope="col" className="py-2 pl-3 pr-5 font-medium sm:pr-6">Last sign-in</th>}
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="py-3 pl-5 pr-3 sm:pl-6">
                      <span className="flex items-center gap-3">
                        <Avatar name={p.full_name || p.email || "?"} />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5 font-medium text-ink">
                            {p.full_name || "—"}
                            {!p.role && <Badge tone="warning">needs a role</Badge>}
                          </span>
                          <span className="block truncate text-caption text-muted">{p.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <RoleForm key={p.id} id={p.id} role={p.role} isSelf={p.id === viewer.user.id} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-ink-2">{fmtDate(p.created_at)}</td>
                    {admin && <td className="whitespace-nowrap py-3 pl-3 pr-5 text-ink-2 sm:pr-6">{fmtWhen(lastSignIn.get(p.id), tz)}</td>}
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
              <div className="space-y-2 text-footnote text-ink-2">
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

          <Card title="Roles">
            <ul className="space-y-3.5">
              {ROLE_HELP.map((r) => (
                <li key={r.role} className="flex items-center gap-3">
                  <IconTile icon={r.icon} color={r.color} />
                  <span className="min-w-0">
                    <span className="block text-subhead font-medium text-ink">{r.title}</span>
                    <span className="block text-footnote text-ink-2">{r.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
