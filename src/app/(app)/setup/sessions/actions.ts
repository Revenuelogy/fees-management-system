// Form handlers for sessions and installments. They call the API (src/app/api/sessions, /installments).

import { api, submit } from "@/lib/api/client";
import type { ActionState } from "@/lib/action-state";
import { isIsoDate } from "@/lib/dates";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

type Result = { message: string };
const withMessage = (r: Result): ActionState => ({ ok: true, message: r.message });

export async function createSession(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const name = str(fd, "name");
  const start = str(fd, "start_date");
  const end = str(fd, "end_date");
  const copyFrom = str(fd, "copy_from") || null;
  const makeCurrent = fd.get("make_current") === "on";

  if (!name) return { error: "Enter a session name, for example 2027-28." };
  if (!isIsoDate(start) || !isIsoDate(end)) return { error: "Enter valid start and end dates." };
  if (end <= start) return { error: "The end date must be after the start date." };

  let rows: { name?: unknown; due_date?: unknown }[];
  try {
    rows = JSON.parse(str(fd, "installments") || "[]");
    if (!Array.isArray(rows)) throw new Error();
  } catch {
    return { error: "Could not read the installment rows." };
  }
  if (rows.length === 0) return { error: "Add at least one installment." };
  const installments: { name: string | null; due_date: string }[] = [];
  for (const [i, r] of rows.entries()) {
    const due = String(r.due_date ?? "");
    if (!isIsoDate(due)) return { error: `Installment ${i + 1} needs a valid due date.` };
    installments.push({ name: String(r.name ?? "").trim() || null, due_date: due });
  }

  return submit(
    () => api.post<Result>("/api/sessions", { name, start_date: start, end_date: end, installments, make_current: makeCurrent, copy_from: copyFrom }),
    withMessage,
  );
}

export async function makeCurrent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return submit(() => api.post<Result>(`/api/sessions/${str(fd, "session_id")}/current`), withMessage);
}

export async function updateSession(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const name = str(fd, "name");
  const start = str(fd, "start_date");
  const end = str(fd, "end_date");
  if (!name) return { error: "Enter a session name." };
  if (!isIsoDate(start) || !isIsoDate(end)) return { error: "Enter valid start and end dates." };
  if (end <= start) return { error: "The end date must be after the start date." };
  return submit(() => api.patch<Result>(`/api/sessions/${str(fd, "session_id")}`, { name, start_date: start, end_date: end }), withMessage);
}

export async function deleteSession(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return submit(() => api.delete<Result>(`/api/sessions/${str(fd, "session_id")}`), withMessage);
}

export async function saveInstallment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "installment_id");
  if (str(fd, "intent") === "delete") return submit(() => api.delete<Result>(`/api/installments/${id}`), withMessage);

  const name = str(fd, "name");
  const due = str(fd, "due_date");
  if (!name) return { error: "Enter a name." };
  if (!isIsoDate(due)) return { error: "Enter a valid due date." };
  return submit(() => api.patch<Result>(`/api/installments/${id}`, { name, due_date: due }), withMessage);
}

export async function addInstallment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const sessionId = str(fd, "session_id");
  const number = Number(str(fd, "number"));
  const due = str(fd, "due_date");
  if (!Number.isInteger(number) || number < 1) return { error: "The installment number must be 1 or more." };
  if (!isIsoDate(due)) return { error: "Enter a valid due date." };
  return submit(() => api.post<Result>(`/api/sessions/${sessionId}/installments`, { number, name: str(fd, "name") || null, due_date: due }), withMessage);
}
