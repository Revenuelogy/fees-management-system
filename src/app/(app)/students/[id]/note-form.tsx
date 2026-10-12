"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { addNote, deleteNote } from "./note-actions";
import type { ActionState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { FormError, Input, Textarea } from "@/components/ui/form";

export function NoteForm({ studentId }: { studentId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addNote, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="student_id" value={studentId} />
      <Textarea name="note" rows={2} placeholder="Call outcome, reason for delay, concession request…" aria-label="Note" required />
      <div className="grid grid-cols-2 gap-2">
        <Input name="promised_date" type="date" aria-label="Promised date" title="Promised payment date (optional)" />
        <Input name="promised_amount" inputMode="decimal" placeholder="Promised ₹ (optional)" aria-label="Promised amount" />
      </div>
      <FormError message={state.error} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Add note"}
      </Button>
    </form>
  );
}

export function DeleteNoteButton({ id, studentId }: { id: string; studentId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label="Delete note"
      onClick={() => {
        if (confirm("Delete this note?")) start(async () => void (await deleteNote(id, studentId)));
      }}
      className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-fill hover:text-critical-ink"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}
