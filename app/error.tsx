"use client";

import { useEffect } from "react";
import Link from "next/link";
import { logger } from "@/lib/logger";

function BoltIcon() {
  return (
    <div className="bg-error/20 rounded-xl w-12 h-12 flex items-center justify-center">
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
    logger.error("GlobalError", "Unhandled error", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-bg text-fg flex flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <BoltIcon />
        <h1 className="mt-6 text-2xl font-bold text-fg">Something went wrong</h1>
        <p className="mt-3 text-fg-muted text-sm leading-relaxed">
          An unexpected error occurred. Our team has been notified. Please try again.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-fg-subtle font-mono">Error ID: {error.digest}</p>
        )}
        <div className="mt-8 flex gap-3">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-full bg-brand hover:bg-primary-hover text-on-primary text-sm font-semibold transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-full border border-line hover:border-line-strong text-fg-muted hover:text-fg text-sm font-semibold transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
