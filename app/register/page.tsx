"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function DoorIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="8" fill="#EEF2FF" />
      <path d="M22 10H13C12.4477 10 12 10.4477 12 11V29C12 29.5523 12.4477 30 13 30H22" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" />
      <path d="M22 10L28 13V27L22 30V10Z" fill="#4F46E5" fillOpacity="0.15" stroke="#4F46E5" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="25" cy="20" r="1.5" fill="#4F46E5" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function BlurredBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100" />
      <div className="absolute inset-0 blur-sm opacity-70">
        <div className="absolute top-0 left-0 right-0 h-14 bg-white/80 border-b border-gray-200" />
        <div className="absolute top-14 left-0 w-52 bottom-0 bg-white/60 border-r border-gray-200" />
        <div className="absolute top-24 left-60 w-72 h-36 bg-indigo-600/80 rounded-xl" />
        <div className="absolute top-24 left-60 right-8 h-8 bg-indigo-700/60 rounded-lg ml-80" />
        <div className="absolute top-36 left-60 right-8 h-8 bg-blue-500/40 rounded-lg ml-80" />
        <div className="absolute top-48 left-60 right-8 h-8 bg-indigo-400/30 rounded-lg ml-80" />
        <div className="absolute bottom-32 left-60 w-48 h-28 bg-white/70 rounded-xl border border-gray-200" />
        <div className="absolute bottom-32 left-60 ml-56 w-48 h-28 bg-white/70 rounded-xl border border-gray-200" />
        <div className="absolute bottom-8 left-60 flex gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 opacity-70" />
          ))}
        </div>
      </div>
      <div className="absolute inset-0 backdrop-blur-sm bg-white/30" />
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "otp">("form");
  const [email, setEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step === "otp") {
      const timer = setTimeout(() => otpRefs.current[0]?.focus(), 420);
      return () => clearTimeout(timer);
    }
  }, [step]);

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type: "register" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send code");
      setStep("otp");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    const otp = otpDigits.join("");
    if (otp.length < 6) { setError("Enter all 6 digits"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, type: "register" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      localStorage.setItem("token", data.token);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(idx: number, val: string) {
    if (!/^\d*$/.test(val)) return;
    const updated = [...otpDigits];
    updated[idx] = val.slice(-1);
    setOtpDigits(updated);
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus();
  }

  function handleOtpKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otpDigits[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const updated = [...otpDigits];
    pasted.split("").forEach((ch, i) => { if (i < 6) updated[i] = ch; });
    setOtpDigits(updated);
    otpRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  function goBack() {
    setStep("form");
    setOtpDigits(["", "", "", "", "", ""]);
    setError("");
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center p-4">
      <BlurredBackground />

      <div className="relative z-10 w-full max-w-2xl flex rounded-2xl shadow-2xl overflow-hidden">
        {/* Left panel — sliding content */}
        <div className="flex-1 bg-white overflow-hidden">
          <div
            className="flex"
            style={{
              width: "200%",
              transform: step === "otp" ? "translateX(-50%)" : "translateX(0)",
              transition: "transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            {/* Step 1 — Email form */}
            <div className="px-10 py-10 flex-shrink-0" style={{ width: "50%" }}>
              <div className="flex justify-end mb-2">
                <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </Link>
              </div>

              <div className="flex flex-col items-center text-center mb-7">
                <DoorIcon />
                <h1 className="mt-4 text-2xl font-bold text-gray-900">Create an account to proceed</h1>
                <p className="mt-1 text-sm text-gray-500">Start making videos with AI today.</p>
              </div>

              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2"><MailIcon /></span>
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)} required
                      placeholder="example@gmail.com"
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    />
                  </div>
                </div>

                {error && step === "form" && (
                  <p className="text-red-500 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
                )}

                <button
                  type="submit" disabled={loading}
                  className="w-full bg-indigo-400 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                >
                  {loading ? "Sending code…" : "Sign up"}
                </button>
              </form>

              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium">OR</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <button
                type="button"
                onClick={() => alert("Google sign-in coming soon!")}
                className="w-full flex items-center justify-center gap-2.5 border border-gray-200 hover:bg-gray-50 rounded-lg py-2.5 text-sm font-medium text-gray-700 transition-colors"
              >
                <GoogleIcon />
                Continue with Google
              </button>

              <p className="text-center text-sm text-gray-500 mt-5">
                Already have an account?{" "}
                <Link href="/login" className="text-blue-600 font-semibold hover:underline">Login</Link>
              </p>
            </div>

            {/* Step 2 — OTP Verification */}
            <div className="px-10 py-10 flex-shrink-0 flex flex-col" style={{ width: "50%" }}>
              <div className="flex justify-end mb-2">
                <button type="button" onClick={goBack} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-col items-center text-center mb-7">
                <DoorIcon />
                <h1 className="mt-4 text-2xl font-bold text-gray-900">Verify Your Email</h1>
                <p className="mt-1 text-sm text-gray-500 leading-relaxed">
                  We&apos;ve sent a six-digit code to<br />
                  <span className="font-medium text-gray-700">{email}</span>
                </p>
              </div>

              <form onSubmit={handleOtpSubmit} className="space-y-5">
                <div className="flex justify-center gap-2.5" onPaste={handleOtpPaste}>
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={el => { otpRefs.current[idx] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(idx, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(idx, e)}
                      className="w-11 h-12 text-center text-xl font-bold border-2 border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white transition-colors"
                    />
                  ))}
                </div>

                {error && step === "otp" && (
                  <p className="text-red-500 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-center">{error}</p>
                )}

                <button
                  type="submit" disabled={loading || otpDigits.join("").length < 6}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                >
                  {loading ? "Verifying…" : "Verify Email"}
                </button>
              </form>

              <div className="flex gap-3 mt-4">
                <a
                  href="https://mail.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 rounded-lg py-2.5 text-sm font-medium text-gray-700 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Open Gmail
                </a>
                <a
                  href={`mailto:${email}`}
                  className="flex-1 flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 rounded-lg py-2.5 text-sm font-medium text-gray-700 transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  Open Email App
                </a>
              </div>

              <button
                type="button" onClick={goBack}
                className="mt-5 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mx-auto"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Back to login
              </button>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="hidden sm:flex w-64 flex-shrink-0 bg-slate-100 flex-col items-center justify-center p-8">
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm w-full">
            <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-white" viewBox="0 0 40 40" fill="none">
                <path d="M22 10H13C12.4477 10 12 10.4477 12 11V29C12 29.5523 12.4477 30 13 30H22" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M22 10L28 13V27L22 30V10Z" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
                <circle cx="25" cy="20" r="1.5" fill="white" />
              </svg>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              {step === "otp"
                ? "Check your inbox for the 6-digit code we just sent."
                : "Get started in seconds. Login or create an account now."}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
