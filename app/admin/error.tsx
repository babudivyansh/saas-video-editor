"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";
import { Button } from "@/app/components/ui/Button";

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
      <h1 className="text-xl font-bold text-fg">Admin page error</h1>
      <p className="mt-2 text-sm text-fg-subtle max-w-md leading-relaxed">
        The admin view failed to render. Retry, or return to the admin dashboard.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-fg-muted font-mono">Error ID: {error.digest}</p>
      )}
      <div className="mt-6 flex gap-3">
        <Button onClick={reset} variant="primary">
          Try again
        </Button>
        <Button href="/admin" variant="secondary">
          Admin home
        </Button>
      </div>
    </main>
  );
}
