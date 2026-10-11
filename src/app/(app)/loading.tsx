export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-2 h-4 w-40 rounded bg-surface-3" />
      <div className="mb-6 h-7 w-72 rounded bg-surface-3" />
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border border-line bg-surface" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="h-72 rounded-xl border border-line bg-surface" />
        <div className="h-72 rounded-xl border border-line bg-surface" />
      </div>
    </div>
  );
}
