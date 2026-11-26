"use client";

// On a demo project: run AutoClip on the same sample video, as your own
// project you can edit, post and download (conversion plan, 2026-11-26).
//
// The demo shows what comes back; this makes it yours in one click. The first
// run of each sample is free (lib/autoclip-minutes.ts isFreeSampleRun), so a
// new account can try the whole flow without spending 10 of its 15 free
// minutes on our footage. The sample is adopted into the user's Assets
// (POST /api/sample-projects/<id>) and the AutoClip page opens with it picked.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/Button";
import { getStoredToken } from "@/app/hooks/useVideoGenerate";

export function RunSampleBanner({ slug }: { slug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const token = getStoredToken();
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sample-projects/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => ({}))) as { asset?: { id: string }; error?: string };
      if (!res.ok || !body.asset) throw new Error(body.error ?? "This sample isn't available right now.");
      router.push(`/dashboard/create/auto-clip?asset=${encodeURIComponent(body.asset.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "This sample isn't available right now.");
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Run AutoClip on this video"
      className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-fg">Make these clips yours</p>
        <p className="mt-0.5 text-sm text-fg-muted">
          Run AutoClip on this video to edit, post and download the clips. Your first run of each demo video is free.
        </p>
        {error && <p role="alert" className="mt-1 text-xs text-error">{error}</p>}
      </div>
      <Button type="button" size="sm" onClick={run} loading={busy}>
        Run it free
      </Button>
    </section>
  );
}
