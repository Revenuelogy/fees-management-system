import { cn } from "@/lib/cn";
import { InfoTip } from "@/components/ui/info-tip";

/**
 * Apple-style card: white, 22px radius, soft shadow, no border.
 * `description` becomes an ⓘ tooltip (keeps the card calm); `subtitle` stays visible.
 */
export function Card({
  title,
  description,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("rounded-[var(--radius-card)] bg-surface shadow-card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 pt-5 sm:px-6">
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-1.5 text-headline font-semibold text-ink">
                {title}
                {description && <InfoTip align="start">{description}</InfoTip>}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-footnote text-ink-2">{subtitle}</p>}
          </div>
          {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName ?? (title || actions ? "px-5 pb-5 pt-4 sm:px-6 sm:pb-6" : "p-5 sm:p-6")}>{children}</div>
    </section>
  );
}
