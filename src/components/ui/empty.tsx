import { Inbox } from "lucide-react";

export function Empty({ title, children, icon: Icon = Inbox }: { title: string; children?: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <Icon className="size-8 text-muted" aria-hidden />
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="max-w-md text-[13px] text-ink-2">{children}</div>}
    </div>
  );
}
