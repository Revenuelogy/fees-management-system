import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "plain";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent whitespace-nowrap";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-strong shadow-[0_1px_2px_rgba(0,113,227,0.25)]",
  secondary: "bg-fill text-ink hover:bg-[rgba(118,118,128,0.18)]",
  ghost: "text-ink-2 hover:bg-fill hover:text-ink",
  danger: "bg-critical text-white hover:opacity-90",
  plain: "text-accent hover:underline underline-offset-4",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-footnote",
  md: "h-9 px-4 text-subhead",
  lg: "h-11 px-6 text-body",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], variant === "plain" && "h-auto px-0", className);
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  ...rest
}: { href: string; variant?: Variant; size?: Size; className?: string; children: React.ReactNode } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
