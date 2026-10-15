/** Plain GET form for a custom date range (works without JavaScript). */
export function DateRangeForm({ from, to }: { from: string; to: string }) {
  return (
    <form action="/payments" className="inline-flex flex-wrap items-center gap-2 text-footnote">
      <input type="hidden" name="preset" value="custom" />
      <label className="inline-flex items-center gap-1 text-muted">
        From
        <input type="date" name="from" defaultValue={from} className="h-9 rounded-full bg-fill-2 px-3 text-subhead text-ink focus:outline-none focus:ring-4 focus:ring-accent/15" />
      </label>
      <label className="inline-flex items-center gap-1 text-muted">
        to
        <input type="date" name="to" defaultValue={to} className="h-9 rounded-full bg-fill-2 px-3 text-subhead text-ink focus:outline-none focus:ring-4 focus:ring-accent/15" />
      </label>
      <button type="submit" className="h-9 rounded-full bg-fill px-4 text-subhead font-medium text-ink hover:bg-[rgba(118,118,128,0.18)]">
        Apply
      </button>
    </form>
  );
}
