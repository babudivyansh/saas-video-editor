export default function Loading() {
  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      {/* Sidebar skeleton */}
      <div className="w-56 flex-shrink-0 bg-zinc-900 border-r border-zinc-800" />

      {/* Main content skeleton */}
      <div className="flex-1 overflow-auto p-8 animate-pulse">
        {/* Step bar */}
        <div className="flex gap-3 mb-10">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 w-24 rounded-full bg-zinc-800" />
          ))}
        </div>

        {/* Form area */}
        <div className="max-w-2xl space-y-6">
          <div className="h-5 w-32 rounded bg-zinc-800" />
          <div className="h-10 w-full rounded-xl bg-zinc-800" />
          <div className="h-5 w-24 rounded bg-zinc-800" />
          <div className="h-40 w-full rounded-xl bg-zinc-800" />
          <div className="h-5 w-28 rounded bg-zinc-800" />
          <div className="grid grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-zinc-800" />
            ))}
          </div>
          <div className="h-12 w-40 rounded-full bg-blue-900/40" />
        </div>
      </div>
    </div>
  );
}
