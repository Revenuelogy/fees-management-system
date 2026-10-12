import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/";
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(0,113,227,0.16),transparent)] blur-2xl"
      />
      <div className="animate-rise relative w-full max-w-[380px]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-[20px] bg-gradient-to-b from-[#2c8cff] to-[#0062c4] text-[30px] font-bold text-white shadow-[0_8px_24px_rgba(0,98,196,0.35)]">
            ₹
          </div>
          <h1 className="text-title1 font-bold text-ink">Fees</h1>
          <p className="mt-1.5 text-body text-ink-2">Sign in with your school account</p>
        </div>
        <div className="rounded-[28px] bg-surface p-7 shadow-card">
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-footnote text-muted">Accounts are created by the school administrator.</p>
      </div>
    </main>
  );
}
