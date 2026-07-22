"use client";

import { useEffect } from "react";
import Link from "next/link";
import { logger } from "@/lib/logger";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("DashboardError", "Unhandled dashboard error", error);
  }, [error]);

  return (
    <main className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="bg-red-100 rounded-xl w-12 h-12 flex items-center justify-center">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h1 className="mt-6 text-xl font-bold text-zinc-900">This page hit an error</h1>
      <p className="mt-2 text-sm text-zinc-500 max-w-md leading-relaxed">
        Your other work is safe. Try again, or head back to the dashboard.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-zinc-400 font-mono">Error ID: {error.digest}</p>
      )}
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="px-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="px-5 py-2.5 rounded-full border border-zinc-300 hover:border-zinc-400 text-zinc-600 hover:text-zinc-900 text-sm font-semibold transition-colors"
        >
          Dashboard home
        </Link>
      </div>
    </main>
  );
}
