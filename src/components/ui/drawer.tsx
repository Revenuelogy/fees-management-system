"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

/**
 * A panel that slides in from the right over the page: a native modal <dialog>, so Escape and a click on the
 * dimmed page close it and focus stays inside while it is open. The content mounts only while open.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // the dialog itself is only hit outside the panel content, i.e. on the dimmed page
      onClick={(e) => e.target === ref.current && onClose()}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-[min(480px,100vw)] overflow-hidden bg-transparent p-0 text-ink backdrop:bg-black/35 backdrop:backdrop-blur-[2px]"
    >
      {open && (
        <div className="animate-drawer flex h-full flex-col bg-surface shadow-pop">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-title3 font-semibold text-ink">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-footnote text-ink-2">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-fill-2 hover:text-ink"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
