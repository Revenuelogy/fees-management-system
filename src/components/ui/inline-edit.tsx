"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/lib/action-state";
import { Button } from "./button";
import { FormError, Input, Textarea } from "./form";

type Save = (value: string | null) => Promise<ActionState>;

/** The dashed "+ Add …" chip of an empty detail. */
export const ADD_CHIP =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-line-strong px-2.5 py-1 text-caption font-semibold leading-4 text-ink-2 transition-colors hover:border-accent hover:text-accent";

/**
 * Click-to-edit text: the value with a pencil beside it. A click on the value or the pencil turns it into a box with
 * Save and Cancel (Enter saves a one-line value, Ctrl/⌘ + Enter a longer one, Esc cancels). `onSave` gets the new text
 * (null when emptied) and returns an ActionState; the box stays open with the error when it fails. Without `canEdit`
 * it is just the value. `children` replaces how the value is shown (keep links out of it: a click edits).
 */
export function InlineText({
  value,
  label,
  onSave,
  canEdit,
  multiline,
  type = "text",
  placeholder,
  maxLength,
  hint,
  inline,
  startEditing,
  onClose,
  className,
  textClassName,
  inputClassName,
  children,
}: {
  value: string | null;
  /** what the value is ("Phone"): read by screen readers on the pencil and shown as "Add phone" when empty */
  label: string;
  onSave: Save;
  canEdit: boolean;
  multiline?: boolean;
  type?: "text" | "tel" | "email";
  placeholder?: string;
  maxLength?: number;
  /** a line under the box while editing */
  hint?: string;
  /** sit in a line of other things (the header's name) instead of taking the full width */
  inline?: boolean;
  startEditing?: boolean;
  /** after a save or a cancel */
  onClose?: () => void;
  className?: string;
  textClassName?: string;
  inputClassName?: string;
  children?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(!!startEditing && canEdit);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  const shown = value ? (children ?? value) : null;
  if (!canEdit) return shown ? <div className={cn(className, textClassName)}>{shown}</div> : null;

  const open = () => {
    setDraft(value ?? "");
    setError(undefined);
    setEditing(true);
  };
  const close = () => {
    setEditing(false);
    setError(undefined);
    onClose?.();
  };
  const save = () =>
    start(async () => {
      const next = draft.trim() ? draft.trim() : null;
      if (next === (value ?? null)) return close();
      const r = await onSave(next);
      if (r.error) return setError(r.error);
      setSaved(true);
      close();
    });

  if (editing) {
    const keys = (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        save();
      }
    };
    return (
      <form
        noValidate
        className={cn("w-full space-y-2", className)}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {multiline ? (
          <Textarea
            aria-label={label}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={keys}
            placeholder={placeholder}
            maxLength={maxLength}
            rows={Math.min(8, Math.max(3, draft.split("\n").length + 1))}
            autoFocus
            disabled={pending}
            className={inputClassName}
          />
        ) : (
          <Input
            aria-label={label}
            type={type}
            inputMode={type === "tel" ? "tel" : undefined}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={keys}
            placeholder={placeholder}
            maxLength={maxLength}
            autoFocus
            disabled={pending}
            className={inputClassName}
          />
        )}
        {hint && <p className="text-caption text-muted">{hint}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" variant="primary" disabled={pending}>
            <Check className="size-3.5" /> {pending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" size="sm" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <span className="hidden text-caption text-muted sm:inline">{multiline ? "Ctrl + Enter to save" : "Enter to save"} · Esc to cancel</span>
        </div>
        <FormError message={error} />
      </form>
    );
  }

  return (
    <div className={cn(inline ? "inline-flex max-w-full" : "flex", "items-start gap-1", className)}>
      {/* the pencil is the control for keyboards and screen readers; a click on the value does the same */}
      <div onClick={open} className={cn("min-w-0 cursor-text break-words", textClassName)}>
        {shown || <span className="text-muted">{placeholder ?? `Add ${label.toLowerCase()}`}</span>}
      </div>
      <button
        type="button"
        onClick={open}
        aria-label={`Edit ${label.toLowerCase()}`}
        title={`Edit ${label.toLowerCase()}`}
        className="-my-1 -ml-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-fill hover:text-ink"
      >
        <Pencil className="size-3.5" />
      </button>
      {saved && (
        <span role="status" className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 text-caption font-medium text-good-ink">
          <Check className="size-3.5" aria-hidden /> Saved
        </span>
      )}
    </div>
  );
}

export type InlineOption = { value: string; label: string; hint?: string };

/**
 * Click-to-choose: the value (a badge, or text) with a pencil; a click anywhere on it opens the list, and picking
 * saves at once. Empty, it is a dashed "+ label" chip. `clearable` adds "Not recorded" to empty it again. Without
 * `canEdit` it is just `children` (nothing when empty).
 */
export function InlineChoice({
  value,
  label,
  options,
  onSave,
  canEdit,
  clearable = true,
  className,
  children,
}: {
  value: string | null;
  label: string;
  options: readonly InlineOption[];
  onSave: Save;
  canEdit: boolean;
  clearable?: boolean;
  className?: string;
  /** how the chosen value is shown (default: its label) */
  children?: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const ref = useRef<HTMLSelectElement>(null);
  const current = options.find((o) => o.value === value);
  const shown = value ? (children ?? current?.label ?? value) : null;
  if (!canEdit) return shown ? <span className={className}>{shown}</span> : null;

  const change = (next: string) =>
    start(async () => {
      setError(undefined);
      const r = await onSave(next || null);
      if (r.error) {
        setError(r.error);
        if (ref.current) ref.current.value = value ?? "";
      }
    });

  return (
    <span className={cn("inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <span
        className={cn(
          "relative inline-flex max-w-full items-center gap-1 rounded-full transition-opacity focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
          pending && "opacity-50",
        )}
      >
        {shown ? (
          <>
            {shown}
            <Pencil className="ml-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
          </>
        ) : (
          <span className={ADD_CHIP}>
            <Plus className="size-3" aria-hidden /> {label}
          </span>
        )}
        {/* the real control: an invisible native list over the chip, so one click (or tap) opens it */}
        <select
          ref={ref}
          aria-label={value && current ? `${label}: ${current.label}. Change it` : `Choose ${label.toLowerCase()}`}
          title={value && current ? `${label} · click to change` : `Choose ${label.toLowerCase()}`}
          value={value ?? ""}
          disabled={pending}
          onChange={(e) => change(e.target.value)}
          className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0 text-[16px]"
        >
          {(clearable || !value) && <option value="">{value ? "Not recorded" : `Choose ${label.toLowerCase()}…`}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} title={o.hint}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
      {error && (
        <span role="alert" className="text-caption font-medium text-critical-ink">
          {error}
        </span>
      )}
    </span>
  );
}
