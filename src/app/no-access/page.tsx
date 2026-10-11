import { ShieldCheck } from "lucide-react";
import { signOut } from "@/app/actions";
import { getViewer } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Waiting for access" };

export default async function NoAccessPage() {
  const viewer = await getViewer();
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-xl border border-line bg-surface p-6 text-center shadow-sm">
        <ShieldCheck className="mx-auto mb-3 size-8 text-muted" aria-hidden />
        <h1 className="text-lg font-semibold text-ink">Your account is waiting for access</h1>
        <p className="mt-2 text-sm text-ink-2">
          {viewer?.user.email ? <>You are signed in as <b>{viewer.user.email}</b>. </> : null}
          An administrator needs to give your account a role in Settings → Staff before you can see fee data.
        </p>
        <form action={signOut} className="mt-5">
          <Button type="submit">Sign out</Button>
        </form>
      </div>
    </main>
  );
}
