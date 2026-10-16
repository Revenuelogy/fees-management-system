// Form handlers for classes and fee heads. They call the API (src/app/api/classes, /fee-heads).

import { api, submit } from "@/lib/api/client";
import type { ActionState } from "@/lib/action-state";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

type Result = { message: string };
const withMessage = (r: Result): ActionState => ({ ok: true, message: r.message });

function intOrNull(v: string): number | null {
  if (v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

function readClass(fd: FormData): { body: { name: string; sort_order: number; is_active: boolean } } | { error: string } {
  const name = str(fd, "name");
  const sort = intOrNull(str(fd, "sort_order"));
  if (!name) return { error: "Enter a class name." };
  if (sort === null) return { error: "Sort order must be a whole number." };
  return { body: { name, sort_order: sort, is_active: fd.get("is_active") === "on" } };
}

export async function saveClass(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "class_id");
  if (str(fd, "intent") === "delete") return submit(() => api.delete<Result>(`/api/classes/${id}`), withMessage);
  const input = readClass(fd);
  if ("error" in input) return input;
  return submit(() => api.patch<Result>(`/api/classes/${id}`, input.body), withMessage);
}

export async function addClass(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const input = readClass(fd);
  if ("error" in input) return input;
  return submit(() => api.post<Result>("/api/classes", input.body), withMessage);
}

// ---------------------------------------------------------------------------
// Fee heads
// ---------------------------------------------------------------------------

function readHead(fd: FormData): { body: { name: string; priority: number; is_active: boolean } } | { error: string } {
  const name = str(fd, "name");
  const priority = intOrNull(str(fd, "priority"));
  if (!name) return { error: "Enter a fee head name." };
  if (priority === null || priority < 0) return { error: "Priority must be a whole number (0 or more)." };
  return { body: { name, priority, is_active: fd.get("is_active") === "on" } };
}

export async function saveFeeHead(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "fee_head_id");
  if (str(fd, "intent") === "delete") return submit(() => api.delete<Result>(`/api/fee-heads/${id}`), withMessage);
  const input = readHead(fd);
  if ("error" in input) return input;
  return submit(() => api.patch<Result>(`/api/fee-heads/${id}`, input.body), withMessage);
}

export async function addFeeHead(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const input = readHead(fd);
  if ("error" in input) return input;
  return submit(() => api.post<Result>("/api/fee-heads", input.body), withMessage);
}
