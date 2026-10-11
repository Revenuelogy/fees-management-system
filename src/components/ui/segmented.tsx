import Link from "next/link";
import { cn } from "@/lib/cn";

/** URL-driven segmented control: each option is a link. */
export function Segmented({
  options,
  label,
}: {
  options: { label: string; href: string; active: boolean; title?: string }[];
  label?: string;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      {label && <span className="text-[13px] text-muted">{label}</span>}
      <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5" role="group" aria-label={label}>
        {options.map((o) => (
          <Link
            key={o.label}
            href={o.href}
            title={o.title}
            scroll={false}
            aria-current={o.active ? "true" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors",
              o.active ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
            )}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Build a URL from a base path and a params object, dropping empty values. */
export function withParams(path: string, params: Record<string, string | number | boolean | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    sp.set(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
  }
  const q = sp.toString();
  return q ? `${path}?${q}` : path;
}
