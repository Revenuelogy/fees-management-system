// Form handlers for the fee structure editor. They call the API (src/app/api/fee-structure).

import { api, submit } from "@/lib/api/client";
import type { ActionState } from "@/lib/action-state";
import { parseRupees } from "@/lib/format";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

type Result = { message: string };
const withMessage = (r: Result): ActionState => ({ ok: true, message: r.message });

export async function saveStructure(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let raw: { installment_id: string; fee_head_id: string; amount: string; label?: string }[];
  try {
    raw = JSON.parse(str(fd, "cells") || "[]");
    if (!Array.isArray(raw)) throw new Error();
  } catch {
    return { error: "Could not read the amounts." };
  }
  const cells: { installment_id: string; fee_head_id: string; amount: number }[] = [];
  for (const c of raw) {
    const text = String(c.amount ?? "").trim();
    const paise = text === "" ? 0 : parseRupees(text);
    if (paise === null || paise < 0) return { error: `Check the amount for ${c.label ?? "a cell"}: “${text}” is not a valid rupee amount.` };
    cells.push({ installment_id: c.installment_id, fee_head_id: c.fee_head_id, amount: paise });
  }
  return submit(() => api.put<Result>("/api/fee-structure", { session_id: str(fd, "session_id"), class_id: str(fd, "class_id"), cells }), withMessage);
}

export async function copyStructure(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const classId = str(fd, "class_id");
  const fromId = str(fd, "from_class");
  if (!fromId) return { error: "Choose the class to copy from." };
  if (fromId === classId) return { error: "Choose a different class to copy from." };
  return submit(
    () => api.post<Result & { amounts: Record<string, number> }>("/api/fee-structure/copy", { session_id: str(fd, "session_id"), class_id: classId, from_class: fromId }),
    (r) => ({ ok: true, message: r.message, data: r.amounts }),
  );
}

export async function applyStructure(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const all = str(fd, "intent") === "all";
  return submit(
    () =>
      api.post<Result>("/api/fee-structure/apply", {
        session_id: str(fd, "session_id"),
        class_id: all ? null : str(fd, "class_id"),
        overwrite: fd.get("overwrite") === "on",
      }),
    withMessage,
  );
}
