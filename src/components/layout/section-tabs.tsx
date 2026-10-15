"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Pill tabs for sections with several pages (Setup, Settings). */
export function SectionTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const activeHref = [...tabs].sort((a, b) => b.href.length - a.href.length).find((t) => pathname === t.href || pathname.startsWith(t.href + "/"))?.href;
  return (
    <nav className="no-print -mx-1 mb-6 overflow-x-auto px-1" aria-label="Section">
      <div className="inline-flex gap-1 rounded-full bg-fill-2 p-1">
        {tabs.map((t) => {
          const active = t.href === activeHref;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-full px-3.5 py-1.5 text-footnote font-medium transition-all",
                active ? "bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,0.1)] dark:bg-surface-3" : "text-ink-2 hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
