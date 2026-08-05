"use client";

// The CSV export buttons for one account.
//
// A client island purely because the download has to carry the bearer token —
// see useSocialDownload. These used to be `<Button href="/api/social/export?…">`
// on the server-rendered page, which meant a Next <Link>: no Authorization
// header (so a 402 on click, for paying users) and prefetch-on-render (so four
// large scans fired just by opening the tab).

import { useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { SocialApiError, useSocialDownload } from "./useSocialApi";

export interface ExportButtonsProps {
  accountId: string;
  exports: ReadonlyArray<{ kind: string; label: string; description: string }>;
}

export function ExportButtons({ accountId, exports }: ExportButtonsProps) {
  const download = useSocialDownload();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: string) => {
    setPending(kind);
    setError(null);
    try {
      await download(
        `/api/social/export?accountId=${encodeURIComponent(accountId)}&kind=${encodeURIComponent(kind)}`,
        `${kind}.csv`,
      );
    } catch (e) {
      // The export limiter is deliberately tight (10 per 5 minutes), so 429 is a
      // reachable state for someone exporting all four kinds twice. Saying so is
      // better than a button that appears to do nothing.
      setError(
        e instanceof SocialApiError
          ? e.status === 429
            ? "Too many exports just now — try again in a few minutes."
            : e.message
          : "Could not download the file.",
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {exports.map((e) => (
          <Button
            key={e.kind}
            variant="secondary"
            size="sm"
            disabled={pending !== null}
            onClick={() => void run(e.kind)}
          >
            {pending === e.kind ? "Preparing…" : e.label}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </>
  );
}
