"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { Card } from "@/app/components/ui/Card";
import { Button } from "@/app/components/ui/Button";

function IcSpinner() { return <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />; }

type ExportState = "idle" | "queued" | "ready" | "failed";

export default function PrivacySettingsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [state, setState] = useState<ExportState>("idle");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  async function requestExport() {
    setState("queued");
    setDownloadUrl(null);
    try {
      const res = await fetch("/api/account/export", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) { setState("failed"); showToast(data.error ?? "Failed to start export", "error"); return; }
      poll(data.jobId);
    } catch {
      setState("failed");
    }
  }

  function poll(jobId: string) {
    const check = async () => {
      const res = await fetch(`/api/account/export/${jobId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.status === "ready") { setState("ready"); setDownloadUrl(data.url); showToast("Your data export is ready"); return; }
      if (data.status === "failed") { setState("failed"); showToast(data.error ?? "Export failed", "error"); return; }
      pollRef.current = setTimeout(check, 3000);
    };
    void check();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-extrabold grad-text inline-block">Privacy</h1>
        <p className="text-sm text-ink-soft mt-1">Your data, on your terms.</p>
      </div>

      <Card padding="md">
        <h2 className="text-base font-extrabold text-ink">Download your data</h2>
        <p className="text-sm text-ink-soft mt-2">
          Get a copy of your profile, projects, clip and asset metadata, purchase history, and sign-in history as a JSON file.
          Media files aren&apos;t re-bundled into the export — the file includes direct links to everything you&apos;ve uploaded or generated instead.
        </p>
        <div className="mt-4">
          {state === "idle" && <Button onClick={requestExport}>Request my data</Button>}
          {state === "queued" && <Button disabled><IcSpinner /> Preparing your export…</Button>}
          {state === "ready" && downloadUrl && (
            <div className="flex items-center gap-3">
              <Button href={downloadUrl}>Download your data</Button>
              <Button variant="secondary" onClick={requestExport}>Request again</Button>
            </div>
          )}
          {state === "failed" && <Button variant="secondary" onClick={requestExport}>Try again</Button>}
        </div>
      </Card>
    </div>
  );
}
