"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/form";
import { useFormAction } from "../_lib/use-form-action";
import { addClass, addFeeHead, saveClass, saveFeeHead } from "./actions";
import { GRID } from "./grid";

export type ClassInfo = { id: string; name: string; sort_order: number; is_active: boolean; inSession: number; enrolments: number; structure: number };
export type FeeHeadInfo = { id: string; name: string; priority: number; is_active: boolean; charges: number; structure: number };

function ActiveToggle({ defaultChecked, label }: { defaultChecked: boolean; label: string }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
      <input type="checkbox" name="is_active" defaultChecked={defaultChecked} aria-label={label} className="size-4 accent-[var(--accent)]" />
      Active
    </label>
  );
}

function RowMessage({ error, message, ok }: { error?: string; message?: string; ok?: boolean }) {
  if (!error && !(ok && message)) return null;
  return (
    <div className="col-span-full">
      <FormError message={error} />
      {ok && message && <p className="text-[12.5px] text-good-ink">{message}</p>}
    </div>
  );
}

export function ClassRow({ cls, sessionName }: { cls: ClassInfo; sessionName: string | null }) {
  const { state, pending, onSubmit } = useFormAction(saveClass);
  const usage = [
    sessionName ? `${cls.inSession} in ${sessionName}` : null,
    cls.enrolments !== cls.inSession ? `${cls.enrolments} in all sessions` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <form onSubmit={onSubmit} className={`${GRID} py-2`}>
      <input type="hidden" name="class_id" value={cls.id} />
      <div className="min-w-0">
        <Input name="name" defaultValue={cls.name} required aria-label="Class name" />
        <p className="mt-0.5 truncate text-[12px] text-muted">{usage || "No students yet"}</p>
      </div>
      <Input name="sort_order" defaultValue={cls.sort_order} inputMode="numeric" aria-label={`Sort order of ${cls.name}`} className="w-[4.5rem] self-start justify-self-end text-right sm:w-full" />
      <div className="self-start pt-2">
        <ActiveToggle defaultChecked={cls.is_active} label={`${cls.name} is active`} />
      </div>
      <div className="flex gap-1.5 self-start justify-self-end">
        <Button type="submit" name="intent" value="save" size="sm" disabled={pending}>
          {pending ? "…" : "Save"}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="delete"
          size="sm"
          variant="ghost"
          disabled={pending}
          aria-label={`Delete ${cls.name}`}
          title={cls.enrolments ? "Cannot delete: students are enrolled in this class" : "Delete class"}
          data-confirm={`Delete ${cls.name}?${cls.structure ? " Its fee structure amounts are removed too." : ""}`}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
      <RowMessage {...state} />
    </form>
  );
}

export function AddClassRow({ nextSort }: { nextSort: number }) {
  const { state, pending, onSubmit, formRef } = useFormAction(addClass, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className={`${GRID} mt-1 border-t border-dashed border-line-strong pt-3`}>
      <Input name="name" placeholder="New class, e.g. Class 11" required aria-label="New class name" />
      <Input key={nextSort} name="sort_order" defaultValue={nextSort} inputMode="numeric" aria-label="New class sort order" className="w-[4.5rem] justify-self-end text-right sm:w-full" />
      <ActiveToggle defaultChecked label="New class is active" />
      <div className="justify-self-end">
        <Button type="submit" size="sm" disabled={pending}>
          <Plus className="size-4" aria-hidden /> {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <RowMessage {...state} />
    </form>
  );
}

export function FeeHeadRow({ head }: { head: FeeHeadInfo }) {
  const { state, pending, onSubmit } = useFormAction(saveFeeHead);
  const used = head.charges > 0 || head.structure > 0;
  const usage = [
    head.structure ? `${head.structure} structure amounts` : null,
    head.charges ? `${head.charges.toLocaleString("en-IN")} charges` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <form onSubmit={onSubmit} className={`${GRID} py-2`}>
      <input type="hidden" name="fee_head_id" value={head.id} />
      <div className="min-w-0">
        <Input name="name" defaultValue={head.name} required aria-label="Fee head name" />
        <p className="mt-0.5 truncate text-[12px] text-muted">{usage || "Not used yet"}</p>
      </div>
      <Input
        name="priority"
        defaultValue={head.priority}
        inputMode="numeric"
        aria-label={`Priority of ${head.name}`}
        className="w-[4.5rem] self-start justify-self-end text-right sm:w-full"
        title="Lower numbers are cleared first"
      />
      <div className="self-start pt-2">
        <ActiveToggle defaultChecked={head.is_active} label={`${head.name} is active`} />
      </div>
      <div className="flex gap-1.5 self-start justify-self-end">
        <Button
          type="submit"
          name="intent"
          value="save"
          size="sm"
          disabled={pending}
        >
          {pending ? "…" : "Save"}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="delete"
          size="sm"
          variant="ghost"
          disabled={pending}
          aria-label={`Delete ${head.name}`}
          title={used ? "Cannot delete: this fee head is in use" : "Delete fee head"}
          data-confirm={`Delete the fee head ${head.name}?`}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
      <RowMessage {...state} />
    </form>
  );
}

export function AddFeeHeadRow({ nextPriority }: { nextPriority: number }) {
  const { state, pending, onSubmit, formRef } = useFormAction(addFeeHead, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className={`${GRID} mt-1 border-t border-dashed border-line-strong pt-3`}>
      <Input name="name" placeholder="New fee head, e.g. Lab Fee" required aria-label="New fee head name" />
      <Input key={nextPriority} name="priority" defaultValue={nextPriority} inputMode="numeric" aria-label="New fee head priority" className="w-[4.5rem] justify-self-end text-right sm:w-full" />
      <ActiveToggle defaultChecked label="New fee head is active" />
      <div className="justify-self-end">
        <Button type="submit" size="sm" disabled={pending}>
          <Plus className="size-4" aria-hidden /> {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <RowMessage {...state} />
    </form>
  );
}
