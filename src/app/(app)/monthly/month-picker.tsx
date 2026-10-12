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
      className="h-9 rounded-full bg-fill px-4 pr-8 text-subhead font-semibold text-ink transition-colors hover:bg-[rgba(118,118,128,0.18)] focus:outline-none focus:ring-4 focus:ring-accent/15"
    >
      {options.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
