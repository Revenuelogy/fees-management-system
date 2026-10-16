// Form handler for promoting students (API: POST /api/promote).

import { api, submit } from "@/lib/api/client";
import type { ActionState } from "@/lib/action-state";

export async function promoteStudents(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const from = String(fd.get("from") ?? "");
  const to = String(fd.get("to") ?? "");
  const generate = fd.get("generate") === "on";
  if (!from || !to) return { error: "Choose both sessions." };
  if (from === to) return { error: "Choose two different sessions." };

  let rows: { from_class: string; target: string }[];
  try {
    rows = JSON.parse(String(fd.get("mapping") ?? "[]"));
    if (!Array.isArray(rows)) throw new Error();
  } catch {
    return { error: "Could not read the class mapping." };
  }
  // "skip" rows are left out; "passed" means the students leave the school (to_class null)
  const mapping = rows
    .filter((r) => r.target && r.target !== "skip")
    .map((r) => ({ from_class: r.from_class, to_class: r.target === "passed" ? null : r.target }));
  if (mapping.length === 0) return { error: "Every class is set to “Do not promote”. Choose at least one target class." };

  return submit(
    () => api.post<{ message: string; result: unknown }>("/api/promote", { from, to, mapping, generate }),
    (r) => ({ ok: true, message: r.message, data: r.result }),
  );
}
