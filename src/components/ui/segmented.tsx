import Link from "next/link";
import { cn } from "@/lib/cn";

/** Apple-style segmented control. URL-driven: each option is a link. */
export function Segmented({
  options,
  label,
  size = "md",
}: {
  options: { label: string; href: string; active: boolean; title?: string }[];
  label?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex items-center gap-2">
      {label && <span className="text-footnote text-muted">{label}</span>}
      <div className="inline-flex rounded-[10px] bg-fill p-[2px]" role="group" aria-label={label}>
        {options.map((o) => (
          <Link
            key={o.label}
            href={o.href}
            title={o.title}
            scroll={false}
            aria-current={o.active ? "true" : undefined}
            className={cn(
              "whitespace-nowrap rounded-[8px] font-medium transition-all duration-200",
              size === "sm" ? "px-2.5 py-[3px] text-caption" : "px-3 py-[5px] text-footnote",
              o.active
                ? "bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_1px_rgba(0,0,0,0.04)] dark:bg-surface-3"
                : "text-ink-2 hover:text-ink",
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
