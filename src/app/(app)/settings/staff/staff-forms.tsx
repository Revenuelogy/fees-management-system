"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import type { AppRole } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input, Select } from "@/components/ui/form";
import { createStaff, setRole } from "./actions";
import { useFormAction } from "../use-form-action";

export const ROLE_OPTIONS: { value: AppRole | "none"; label: string }[] = [
  { value: "admin", label: "Owner / Director (admin)" },
  { value: "accountant", label: "Accountant" },
  { value: "principal", label: "Principal (read-only)" },
  { value: "teacher", label: "Teacher (no access yet)" },
  { value: "none", label: "No access" },
];

export function RoleForm({ id, role, isSelf }: { id: string; role: AppRole | null; isSelf: boolean }) {
  const [state, onSubmit, pending] = useFormAction(setRole);
  const initial = role ?? "none";
  const [value, setValue] = useState<string>(initial);

  if (isSelf) {
    return (
      <span className="text-[13px] text-ink-2" title="You cannot remove your own admin role">
        {ROLE_OPTIONS.find((o) => o.value === initial)?.label} · you
      </span>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Select
        name="role"
        aria-label="Role"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-auto min-w-[190px] text-[13px]"
      >
        {ROLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {value !== initial && (
        <Button type="submit" size="sm" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      )}
      {state.error && <span className="w-full text-[12.5px] text-critical-ink">{state.error}</span>}
      {state.ok && value === initial && <span className="text-[12.5px] text-good-ink">Saved</span>}
    </form>
  );
}

export function AddStaffForm() {
  // Remount the form after a successful create so the fields (and the password) are cleared.
  const [formKey, setFormKey] = useState(0);
  const [state, onSubmit, pending] = useFormAction(async (prev, formData) => {
    const result = await createStaff(prev, formData);
    if (result.ok) setFormKey((k) => k + 1);
    return result;
  });

  return (
    <form key={formKey} onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="staff-name">
          <Input id="staff-name" name="full_name" required autoComplete="off" />
        </Field>
        <Field label="Email (login)" htmlFor="staff-email">
          <Input id="staff-email" name="email" type="email" required autoComplete="off" />
        </Field>
        <Field label="Temporary password" htmlFor="staff-password" hint="At least 8 characters. Share it privately; they can sign in straight away.">
          <Input id="staff-password" name="password" type="text" required minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="Role" htmlFor="staff-role">
          <Select id="staff-role" name="role" defaultValue="accountant">
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <FormError message={state.error} />
      <FormSuccess message={state.ok ? state.message : null} />
      <Button type="submit" variant="primary" disabled={pending}>
        <UserPlus className="size-4" /> {pending ? "Creating…" : "Create login"}
      </Button>
    </form>
  );
}
