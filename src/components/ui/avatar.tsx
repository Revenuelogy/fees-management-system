import { cn } from "@/lib/cn";

const TINTS = [
  "bg-[#e3efff] text-[#0058b8] dark:bg-[#0a2a4d] dark:text-[#8cc2ff]",
  "bg-[#fff0de] text-[#a85400] dark:bg-[#3d2606] dark:text-[#ffc277]",
  "bg-[#dff5f8] text-[#16798a] dark:bg-[#0b3238] dark:text-[#86dceb]",
  "bg-[#ecebff] text-[#3e3ab0] dark:bg-[#211f4d] dark:text-[#b2afff]",
  "bg-[#e5f7ea] text-[#1f7a37] dark:bg-[#0e3219] dark:text-[#8ee6a4]",
  "bg-[#ffe8ec] text-[#b0213e] dark:bg-[#3d0f19] dark:text-[#ff9cae]",
];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function tint(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

/** Initials avatar with a stable soft tint per name. */
export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const s = { sm: "size-7 text-[11px]", md: "size-9 text-caption", lg: "size-12 text-subhead", xl: "size-16 text-title3" }[size];
  return (
    <span className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-tight", s, tint(name), className)} aria-hidden>
      {initials(name)}
    </span>
  );
}
