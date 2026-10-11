"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  AlertCircle, ArrowRight, CalendarDays, CalendarRange, Coins, FileText, GraduationCap, IndianRupee, Layers,
  LayoutDashboard, ListChecks, Menu, Receipt, Scale, School, Settings, ShieldCheck, Upload, Users, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { AppRole } from "@/lib/types";
import { NAV } from "./nav";

const ICONS: Record<string, React.ElementType> = {
  AlertCircle, ArrowRight, CalendarDays, CalendarRange, Coins, FileText, GraduationCap, IndianRupee, Layers,
  LayoutDashboard, ListChecks, Receipt, Scale, School, Settings, ShieldCheck, Upload, Users,
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/setup" || href === "/settings") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({ role, schoolName }: { role: AppRole; schoolName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav
      className="flex flex-col gap-5 px-3 py-4"
      aria-label="Main"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) setOpen(false);
      }}
    >
      {NAV.map((g) => {
        const items = g.items.filter((i) => !i.roles || i.roles.includes(role));
        if (items.length === 0) return null;
        return (
          <div key={g.label}>
            <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.label}</p>
            <ul className="space-y-0.5">
              {items.map((i) => {
                const Icon = ICONS[i.icon] ?? LayoutDashboard;
                const active = isActive(pathname, i.href);
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] transition-colors",
                        active ? "bg-accent-soft font-medium text-accent-strong" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                        i.href === "/collect" && !active && "text-ink",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {i.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2.5 px-5 py-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-[15px] font-bold text-accent-ink">₹</span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold leading-tight text-ink">{schoolName}</span>
        <span className="block text-[11.5px] text-muted">Fees management</span>
      </span>
    </Link>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-print fixed left-3 top-3 z-40 inline-flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-ink lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col overflow-y-auto border-r border-line bg-surface lg:flex">
        {brand}
        {nav}
      </aside>

      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col overflow-y-auto bg-surface shadow-xl">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2">
                <X className="size-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
