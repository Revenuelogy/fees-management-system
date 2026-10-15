import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="no-print mb-1.5 flex flex-wrap items-center gap-0.5 text-footnote text-muted">
      {items.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          {i > 0 && <ChevronRight className="size-3.5 opacity-60" aria-hidden />}
          {c.href ? (
            <Link href={c.href} className="rounded px-0.5 transition-colors hover:text-accent">
              {c.label}
            </Link>
          ) : (
            <span className="px-0.5 text-ink-2">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/**
 * Large-title page header. Keep `description` to one short line; longer explanations go in `info`.
 */
export function PageHeader({
  title,
  description,
  info,
  crumbs = [],
  actions,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  info?: React.ReactNode;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 sm:mb-8">
      <Breadcrumbs items={crumbs} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-title1 font-bold text-ink sm:text-large">
            {title}
            {info && <InfoTip align="start">{info}</InfoTip>}
          </h1>
          {description && <p className="mt-1.5 max-w-3xl text-body text-ink-2">{description}</p>}
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="no-print mt-5 flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  );
}
