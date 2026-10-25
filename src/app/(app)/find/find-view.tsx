"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { ChevronRight, Phone, Search, UsersRound } from "lucide-react";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { RELATION_LABELS, fmtPhone } from "@/lib/recovery";
import type { FamilySearchRow } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Empty } from "@/components/ui/empty";

/** Find a family to call: by a parent's name or phone, or a child's name, admission number or parents' names. */
export function FindView() {
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const res = useApi<FamilySearchRow[]>(query.length >= 2 ? apiUrl("/api/families/search", { q: query }) : null, { refreshInterval: 0 });

  return (
    <div className="space-y-5">
      <PageHeader title="Find a family" description="Search by a parent's name or phone, or a child's name or admission number." />
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, phone or admission number…"
          aria-label="Find a family"
          className="h-12 pl-11 text-body"
        />
      </div>

      {query.length < 2 ? (
        <Card>
          <Empty title="Type at least two letters" icon={UsersRound}>
            Open a family to see its full profile and log a call.
          </Empty>
        </Card>
      ) : !res.data ? (
        <p className="text-footnote text-muted">{res.error ? res.error.message : "Searching…"}</p>
      ) : res.data.length === 0 ? (
        <Card>
          <Empty title="No family found" icon={Search}>
            Try another spelling, the last digits of the phone number, or the admission number.
          </Empty>
        </Card>
      ) : (
        <Card bodyClassName="p-2 sm:p-3">
          <ul className="divide-y divide-line">
            {res.data.map((f) => (
              <li key={f.parent_id}>
                <Link href={`/calls/${f.parent_id}`} className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-3 hover:bg-fill-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-subhead font-semibold text-ink">
                      {f.name} <span className="font-normal text-ink-2">({RELATION_LABELS[f.relation]})</span>
                    </span>
                    <span className="block text-footnote text-ink-2">
                      {f.children.length === 0
                        ? "No children linked"
                        : f.children
                            .map((k) => `${k.full_name}${k.class_name ? ` · ${k.class_name}` : ""}${k.status !== "active" ? " (left)" : ""}`)
                            .join(", ")}
                    </span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-caption text-muted">
                      <Phone className="size-3" /> {fmtPhone(f.phone)}
                      {f.alt_phone ? ` · ${fmtPhone(f.alt_phone)}` : ""}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
