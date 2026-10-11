"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { IndianRupee, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SearchResult } from "@/lib/types";

/**
 * Fast student lookup by name, admission no, father's name or phone.
 * Ctrl/⌘+K focuses it from anywhere. Enter opens the highlighted student.
 */
export function StudentSearch({
  mode = "profile",
  autoFocus = false,
  placeholder = "Search student, admission no, father, phone…",
  className,
  large = false,
  canCollect = true,
}: {
  mode?: "profile" | "collect";
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
  large?: boolean;
  canCollect?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (mode !== "profile") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/students/search?q=${encodeURIComponent(term)}&limit=12`, { signal: ctrl.signal });
        const data = await res.json();
        if (Array.isArray(data)) {
          setResults(data);
          setHi(0);
          setOpen(true);
        }
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const shown = q.trim() ? results : [];
  const target = (r: SearchResult) => (mode === "collect" ? `/collect/${r.id}` : `/students/${r.id}`);

  function go(r: SearchResult) {
    setOpen(false);
    setQ("");
    router.push(target(r));
  }

  return (
    <div className={cn("relative", className)}>
      <Search className={cn("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted", large ? "size-5" : "size-4")} aria-hidden />
      <input
        ref={inputRef}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => shown.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && shown[hi]) {
            e.preventDefault();
            go(shown[hi]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Search students"
        placeholder={placeholder}
        className={cn(
          "w-full rounded-lg border border-line-strong bg-surface text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
          large ? "h-12 pl-10 pr-4 text-base" : "h-9 pl-9 pr-3 text-sm sm:pr-14",
        )}
      />
      {!large && mode === "profile" && (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[11px] text-muted sm:block">
          Ctrl K
        </kbd>
      )}
      {open && q.trim() && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[60vh] overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-lg"
        >
          {shown.length === 0 && (
            <li className="px-3 py-3 text-[13px] text-ink-2">{loading ? "Searching…" : "No student found"}</li>
          )}
          {shown.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === hi}>
              <div className={cn("flex items-center gap-2 px-3 py-2", i === hi && "bg-surface-2")} onMouseEnter={() => setHi(i)}>
                <Link href={target(r)} onMouseDown={(e) => e.preventDefault()} onClick={() => go(r)} className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">
                    {r.full_name} <span className="font-normal text-muted">· {r.admission_no}</span>
                    {r.status !== "active" && <span className="ml-1 text-[11.5px] font-normal text-muted">({r.status.replace("_", " ")})</span>}
                  </span>
                  <span className="block truncate text-[12px] text-ink-2">
                    {r.class_name ? `${r.class_name}${r.section ? "-" + r.section : ""}` : "No class"}
                    {r.roll_no ? ` · Roll ${r.roll_no}` : ""}
                    {r.father_name ? ` · S/o, D/o ${r.father_name}` : ""}
                    {r.phone ? ` · ${r.phone}` : ""}
                  </span>
                </Link>
                {mode === "profile" && canCollect && (
                  <Link
                    href={`/collect/${r.id}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setOpen(false)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] font-medium text-ink-2 hover:border-accent hover:text-accent"
                  >
                    <IndianRupee className="size-3.5" aria-hidden /> Collect
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
