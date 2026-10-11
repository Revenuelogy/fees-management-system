import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/";
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-accent text-lg font-bold text-accent-ink">₹</div>
          <h1 className="text-xl font-semibold text-ink">Fees Management</h1>
          <p className="mt-1 text-sm text-ink-2">Sign in with your school staff account</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <LoginForm next={next} />
        </div>
        <p className="mt-4 text-center text-[12.5px] text-muted">
          Accounts are created by the school administrator.
        </p>
      </div>
    </main>
  );
}
