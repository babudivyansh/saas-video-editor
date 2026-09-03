"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function BoltIcon() {
  return <img src="/icon.png" alt="Clipiro" className="w-10 h-10 rounded-xl" />;
}

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (!token) {
      setError("Invalid reset link. Please request a new password reset.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-red-400 text-sm mb-4">Invalid or missing reset token.</p>
        <Link href="/login" className="text-blue-400 hover:underline text-sm">Back to login</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-green-600/20 flex items-center justify-center mx-auto">
          <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-fg font-semibold">Password updated!</p>
        <p className="text-fg-muted text-sm">Redirecting you to login…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-fg-muted mb-1.5">New password</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          required
          className="w-full rounded-xl border border-line bg-surface-3 px-4 py-2.5 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-fg-muted mb-1.5">Confirm password</label>
        <input
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="Repeat new password"
          required
          className="w-full rounded-xl border border-line bg-surface-3 px-4 py-2.5 text-sm text-fg placeholder-fg-subtle focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {error && (
        <p className="text-red-400 text-sm bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
      >
        {loading ? "Updating…" : "Set new password"}
      </button>

      <p className="text-center text-sm text-fg-subtle">
        <Link href="/login" className="text-blue-400 hover:underline">Back to login</Link>
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-bg text-fg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8">
          <BoltIcon />
          <span className="text-lg font-bold text-fg">Clipiro</span>
        </div>

        <h1 className="text-2xl font-bold text-fg mb-1">Set new password</h1>
        <p className="text-fg-muted text-sm mb-8">Choose a strong password for your account.</p>

        <Suspense fallback={<div className="animate-pulse h-40 rounded-xl bg-surface-3" />}>
          <ResetForm />
        </Suspense>
      </div>
    </main>
  );
}
