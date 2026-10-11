"use client";

import { useRouter } from "next/navigation";

export function MonthPicker({
  months,
  value,
  hrefTemplate,
}: {
  months: { value: string; label: string }[];
  value: string;
  /** URL containing __M__ where the month goes */
  hrefTemplate: string;
}) {
  const router = useRouter();
  const options = months.some((m) => m.value === value) ? months : [{ value, label: value }, ...months];
  return (
    <select
      aria-label="Month"
      value={value}
      onChange={(e) => router.push(hrefTemplate.replace("__M__", e.target.value))}
      className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 pr-8 text-sm font-medium text-ink focus:border-accent focus:outline-none"
    >
      {options.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
