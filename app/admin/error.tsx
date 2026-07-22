"use client";

import { useEffect } from "react";
import Link from "next/link";
import { logger } from "@/lib/logger";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("AdminError", "Unhandled admin error", error);
  }, [error]);

  return (
    <main className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-bold text-zinc-900">Admin page error</h1>
      <p className="mt-2 text-sm text-zinc-500 max-w-md leading-relaxed">
        The admin view failed to render. Retry, or return to the admin dashboard.
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
          href="/admin"
          className="px-5 py-2.5 rounded-full border border-zinc-300 hover:border-zinc-400 text-zinc-600 hover:text-zinc-900 text-sm font-semibold transition-colors"
        >
          Admin home
        </Link>
      </div>
    </main>
  );
}
