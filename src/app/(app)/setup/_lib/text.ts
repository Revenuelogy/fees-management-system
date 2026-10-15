/** "1 student" / "1,204 students" */
export function plural(n: number, one: string, many?: string) {
  return `${n.toLocaleString("en-IN")} ${n === 1 ? one : (many ?? one + "s")}`;
}

/** "a, b and c" */
export function listJoin(items: string[], max = 6): string {
  if (items.length <= 1) return items.join("");
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} and ${rest} more`;
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}
