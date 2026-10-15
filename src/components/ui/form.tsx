import { cn } from "@/lib/cn";

const field =
  "block w-full rounded-xl border border-transparent bg-fill-2 px-3.5 py-2 text-body text-ink placeholder:text-muted transition-colors hover:bg-fill focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:opacity-50";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, "h-10 py-0", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(field, "h-10 py-0 pr-9", className)} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-footnote font-medium text-ink-2">
        {label}
      </label>
      {children}
      {hint && <p className="text-caption text-muted">{hint}</p>}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-critical-soft px-3.5 py-2.5 text-footnote font-medium text-critical-ink">
      {message}
    </p>
  );
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-xl bg-good-soft px-3.5 py-2.5 text-footnote font-medium text-good-ink">
      {message}
    </p>
  );
}
