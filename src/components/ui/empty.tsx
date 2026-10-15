import { Inbox } from "lucide-react";

export function Empty({ title, children, icon: Icon = Inbox }: { title: string; children?: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <span className="mb-1 inline-flex size-12 items-center justify-center rounded-2xl bg-fill-2 text-muted">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="text-headline font-semibold text-ink">{title}</p>
      {children && <div className="max-w-md text-subhead text-ink-2">{children}</div>}
    </div>
  );
}
