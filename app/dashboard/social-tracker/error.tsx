"use client";

// Per-route error boundary.
//
// v1 had none: a failed load silently rendered the empty state, so a user with
// three connected accounts was told to connect one. Recovering here re-runs the
// server render rather than reloading the whole page.

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/app/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Next does not report render errors caught by a boundary on its own. The
    // digest is the handle that ties this to the server-side log.
    Sentry.captureException(error, {
      tags: { area: "social-tracker-v2", digest: error.digest ?? "none" },
    });
  }, [error]);

  return (
    <div className="rounded-[var(--radius-card)] border border-card-border bg-white p-10 text-center shadow-card">
      <h2 className="text-base font-semibold text-ink">Couldn&apos;t load your analytics</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
        This is on our side, not yours — your connected accounts and their history are unaffected.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-ink-soft">
          Reference: <code className="font-mono">{error.digest}</code>
        </p>
      )}
      <div className="mt-5">
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
