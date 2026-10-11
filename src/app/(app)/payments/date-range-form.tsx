/** Plain GET form for a custom date range (works without JavaScript). */
export function DateRangeForm({ from, to }: { from: string; to: string }) {
  return (
    <form action="/payments" className="inline-flex flex-wrap items-center gap-2 text-[13px]">
      <input type="hidden" name="preset" value="custom" />
      <label className="inline-flex items-center gap-1 text-muted">
        From
        <input type="date" name="from" defaultValue={from} className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-ink" />
      </label>
      <label className="inline-flex items-center gap-1 text-muted">
        to
        <input type="date" name="to" defaultValue={to} className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-ink" />
      </label>
      <button type="submit" className="h-8 rounded-lg border border-line-strong bg-surface px-2.5 font-medium text-ink hover:bg-surface-2">
        Apply
      </button>
    </form>
  );
}
