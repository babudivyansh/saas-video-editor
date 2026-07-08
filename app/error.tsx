"use client";

import { useEffect } from "react";
import Link from "next/link";

function BoltIcon() {
  return (
    <div className="bg-red-600/20 rounded-xl w-12 h-12 flex items-center justify-center">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    </div>
  );
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <BoltIcon />
        <h1 className="mt-6 text-2xl font-bold text-zinc-100">Something went wrong</h1>
        <p className="mt-3 text-zinc-400 text-sm leading-relaxed">
          An unexpected error occurred. Our team has been notified. Please try again.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-zinc-600 font-mono">Error ID: {error.digest}</p>
        )}
        <div className="mt-8 flex gap-3">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-full border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-zinc-100 text-sm font-semibold transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
