"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function BoltIcon() {
  return <img src="/icon.png" alt="Clipiro" className="w-10 h-10 rounded-xl" />;
}

type Status = "verifying" | "done" | "error";

function VerifyBody() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<Status>("verifying");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setError("Invalid or missing verification link."); return; }
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) { setStatus("error"); setError(data.error || "Something went wrong."); return; }
        setStatus("done");
      } catch {
        setStatus("error");
        setError("Network error — please try again.");
      }
    })();
  }, [token]);

  if (status === "verifying") {
    return (
      <div className="text-center space-y-3">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-fg-muted text-sm">Verifying your email…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="text-center space-y-3">
        <p className="text-red-400 text-sm bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">{error}</p>
        <Link href="/dashboard/settings/security" className="text-blue-400 hover:underline text-sm">Back to Security settings</Link>
      </div>
    );
  }

  return (
    <div className="text-center space-y-3">
      <div className="w-12 h-12 rounded-full bg-green-600/20 flex items-center justify-center mx-auto">
        <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-fg font-semibold">Email verified!</p>
      <Link href="/dashboard" className="text-blue-400 hover:underline text-sm">Go to Dashboard</Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="min-h-screen bg-bg text-fg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8">
          <BoltIcon />
          <span className="text-lg font-bold text-fg">Clipiro</span>
        </div>
        <h1 className="text-2xl font-bold text-fg mb-1">Verify your email</h1>
        <p className="text-fg-muted text-sm mb-8">Confirming this is really you.</p>
        <Suspense fallback={<div className="animate-pulse h-24 rounded-xl bg-surface-3" />}>
          <VerifyBody />
        </Suspense>
      </div>
    </main>
  );
}
