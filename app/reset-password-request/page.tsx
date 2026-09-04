"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";

function BrandIcon() {
  return <img src="/icon.png" alt="Clipiro" className="w-12 h-12 rounded-2xl" />;
}

function MailIcon() {
  return (
    <svg className="w-4 h-4 text-fg-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

const inputClass =
  "w-full pl-10 pr-4 py-3 border border-line hover:border-line-strong focus:border-brand focus:ring-2 focus:ring-brand/10 rounded-xl text-sm text-fg placeholder-fg-subtle focus:outline-none bg-panel transition-all";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong.");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center p-4 bg-bg text-fg">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-surface-2 to-surface-3" />

      <div className="relative z-10 w-full max-w-[420px] rounded-2xl shadow-2xl overflow-hidden bg-panel px-8 py-8">
        {sent ? (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-tint-blue flex items-center justify-center mx-auto">
              <MailIcon />
            </div>
            <h1 className="mt-4 text-[22px] font-bold text-fg tracking-tight">Check your email</h1>
            <p className="mt-2 text-sm text-fg-muted leading-relaxed">
              If <span className="font-semibold text-fg">{email}</span> is registered, we&apos;ve sent a password reset link. Check your inbox (and spam folder).
            </p>
            <p className="mt-1 text-xs text-fg-subtle">The link expires in 15 minutes.</p>
            <Link href="/login" className="inline-block mt-6 text-sm text-brand-deep font-semibold hover:underline">
              Back to login
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center text-center mb-7">
              <BrandIcon />
              <h1 className="mt-4 text-[22px] font-bold text-fg tracking-tight">Forgot password?</h1>
              <p className="mt-1 text-sm text-fg-muted">Enter your email and we&apos;ll send you a reset link.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><MailIcon /></span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Email address"
                  required
                  className={inputClass}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 text-error text-sm bg-error/10 border border-error/30 rounded-xl px-3.5 py-2.5 text-center justify-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className={`w-full font-semibold py-3 rounded-full text-sm transition-all flex items-center justify-center gap-2 ${
                  email && !loading
                    ? "bg-brand hover:bg-brand-dark active:scale-[0.99] text-on-primary shadow-md shadow-brand/30"
                    : "bg-surface-3 text-fg-subtle cursor-not-allowed"
                }`}
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <p className="text-center text-[13px] text-fg-muted mt-5">
              <Link href="/login" className="text-brand-deep font-semibold hover:underline">Back to login</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
