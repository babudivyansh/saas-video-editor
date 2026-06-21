"use client";

import { useState, useRef, useEffect } from "react";

function BrandIcon() {
  return (
    <div className="w-12 h-12 rounded-2xl bg-[#335CFF] flex items-center justify-center shadow-lg shadow-blue-200">
      <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    </div>
  );
}

function MailIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function BackArrow() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" width="18" height="18">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

const inputClass =
  "w-full pl-10 pr-4 py-3 border border-gray-200 hover:border-gray-300 focus:border-[#335CFF] focus:ring-2 focus:ring-[#335CFF]/10 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-white transition-all";

type LoginStep = "identifier" | "password" | "otp";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function detectMethod(identifier: string): "email" | "phone" {
  return identifier.includes("@") ? "email" : "phone";
}

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

function isValidPhone(value: string): boolean {
  return /^\+?[0-9]{7,15}$/.test(value.trim().replace(/[\s-]/g, ""));
}

function isValidIdentifier(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return v.includes("@") ? isValidEmail(v) : isValidPhone(v);
}

function PrimaryBtn({ enabled, loading, children }: { enabled: boolean; loading?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={!enabled || loading}
      className={`w-full font-semibold py-3 rounded-full text-sm transition-all flex items-center justify-center gap-2 ${
        enabled && !loading
          ? "bg-[#335CFF] hover:bg-[#2448e8] active:scale-[0.99] text-white shadow-md shadow-blue-200/60"
          : "bg-gray-100 text-gray-400 cursor-not-allowed"
      }`}
    >
      {children}
    </button>
  );
}

interface AuthFormProps {
  initialMode: "login" | "register";
  onSuccess?: (token: string) => void;
  onModeToggle?: (mode: "login" | "register") => void;
  isModalContext?: boolean;
}

export default function AuthForm({
  initialMode,
  onSuccess,
  onModeToggle,
}: AuthFormProps) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);

  const [loginStep, setLoginStep] = useState<LoginStep>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [devCode, setDevCode] = useState<string | null>(null);

  const [reg, setReg] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { setMode(initialMode); }, [initialMode]);

  useEffect(() => {
    if (loginStep === "otp") {
      const timer = setTimeout(() => otpRefs.current[0]?.focus(), 460);
      return () => clearTimeout(timer);
    }
  }, [loginStep]);

  function finishAuth(token: string) {
    localStorage.setItem("token", token);
    onSuccess?.(token);
  }

  function handleIdentifierContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) { setError("Enter your email or phone number"); return; }
    setError("");
    setLoginStep("password");
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: detectMethod(identifier), identifier, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Login failed");
      finishAuth(data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp() {
    setError("");
    setLoading(true);
    setDevCode(null);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: detectMethod(identifier), identifier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send code");
      if (data.devCode) setDevCode(data.devCode);
      setOtpDigits(["", "", "", "", "", ""]);
      setLoginStep("otp");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const otp = otpDigits.join("");
    if (otp.length < 6) { setError("Enter all 6 digits"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: detectMethod(identifier), identifier, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      finishAuth(data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (reg.password !== reg.confirmPassword) { setError("Passwords do not match"); return; }
    if (reg.password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reg),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sign up failed");
      finishAuth(data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign up failed");
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
    if (e.key === "Backspace" && !otpDigits[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
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

  function goToStep(step: LoginStep) { setError(""); setLoginStep(step); }

  const toggleMode = () => {
    const nextMode = mode === "login" ? "register" : "login";
    setMode(nextMode);
    setError("");
    setLoginStep("identifier");
    setLoginPassword("");
    setOtpDigits(["", "", "", "", "", ""]);
    setDevCode(null);
    onModeToggle?.(nextMode);
  };

  const identifierIsEmail = detectMethod(identifier) === "email";

  const errorBlock = error && (
    <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
      <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>{error}</span>
    </div>
  );

  const identifierOk = isValidIdentifier(identifier);
  const passwordOk = loginPassword.length > 0;
  const otpOk = otpDigits.join("").length === 6;
  const registerOk =
    reg.firstName.trim().length > 0 &&
    reg.lastName.trim().length > 0 &&
    isValidEmail(reg.email) &&
    isValidPhone(reg.phone) &&
    reg.password.length >= 8 &&
    reg.password === reg.confirmPassword;

  // ── Register ────────────────────────────────────────────────────────────────
  if (mode === "register") {
    return (
      <div className="flex-1 bg-white px-8 py-8">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <BrandIcon />
          <h1 className="mt-4 text-[22px] font-bold text-gray-900 tracking-tight">Create your account</h1>
          <p className="mt-1 text-sm text-gray-500">Start making viral videos with AI today.</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-3">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><UserIcon /></span>
              <input
                type="text"
                value={reg.firstName}
                onChange={e => setReg({ ...reg, firstName: e.target.value })}
                required
                placeholder="First name"
                className={inputClass}
              />
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><UserIcon /></span>
              <input
                type="text"
                value={reg.lastName}
                onChange={e => setReg({ ...reg, lastName: e.target.value })}
                required
                placeholder="Last name"
                className={inputClass}
              />
            </div>
          </div>

          {/* Email */}
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><MailIcon /></span>
            <input
              type="email"
              value={reg.email}
              onChange={e => setReg({ ...reg, email: e.target.value })}
              required
              placeholder="Email address"
              className={inputClass}
            />
          </div>

          {/* Phone */}
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><PhoneIcon /></span>
            <input
              type="tel"
              value={reg.phone}
              onChange={e => setReg({ ...reg, phone: e.target.value })}
              required
              placeholder="Phone number (+91...)"
              className={inputClass}
            />
          </div>

          {/* Password row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><LockIcon /></span>
              <input
                type="password"
                value={reg.password}
                onChange={e => setReg({ ...reg, password: e.target.value })}
                required
                placeholder="Password"
                className={inputClass}
              />
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><LockIcon /></span>
              <input
                type="password"
                value={reg.confirmPassword}
                onChange={e => setReg({ ...reg, confirmPassword: e.target.value })}
                required
                placeholder="Confirm password"
                className={inputClass}
              />
            </div>
          </div>

          {errorBlock}

          <PrimaryBtn enabled={registerOk} loading={loading}>
            {loading ? "Creating account…" : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                Get Started — It&apos;s Free
              </>
            )}
          </PrimaryBtn>
        </form>

        <p className="text-center text-[13px] text-gray-500 mt-5">
          Already have an account?{" "}
          <button type="button" onClick={toggleMode} className="text-[#335CFF] font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer">
            Sign in
          </button>
        </p>
      </div>
    );
  }

  // ── Login slider ────────────────────────────────────────────────────────────
  const translateX =
    loginStep === "identifier" ? "0%" : loginStep === "password" ? "-33.3333%" : "-66.6667%";

  return (
    <div className="flex-1 bg-white overflow-hidden">
      <div
        className="flex"
        style={{
          width: "300%",
          transform: `translateX(${translateX})`,
          transition: "transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* Panel 1 — identifier */}
        <div className="px-8 py-8 flex-shrink-0" style={{ width: "33.3333%" }}>
          <div className="flex flex-col items-center text-center mb-7">
            <BrandIcon />
            <h1 className="mt-4 text-[22px] font-bold text-gray-900 tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-gray-500">Sign in to your Clipiro account</p>
          </div>

          <form onSubmit={handleIdentifierContinue} className="space-y-3">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                {identifierIsEmail ? <MailIcon /> : <PhoneIcon />}
              </span>
              <input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                required
                placeholder="Email or phone number"
                className={inputClass}
              />
            </div>

            {loginStep === "identifier" && errorBlock}

            <PrimaryBtn enabled={identifierOk} loading={loading}>
              Continue
            </PrimaryBtn>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400 font-medium">or</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          <button
            type="button"
            onClick={() => alert("Google sign-in coming soon!")}
            className="w-full flex items-center justify-center gap-2.5 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100 rounded-full py-3 text-sm font-medium text-gray-700 transition-all shadow-sm"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <p className="text-center text-[13px] text-gray-500 mt-5">
            Don&apos;t have an account?{" "}
            <button type="button" onClick={toggleMode} className="text-[#335CFF] font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer">
              Sign up free
            </button>
          </p>
        </div>

        {/* Panel 2 — password */}
        <div className="px-8 py-8 flex-shrink-0" style={{ width: "33.3333%" }}>
          <div className="flex flex-col items-center text-center mb-7">
            <BrandIcon />
            <h1 className="mt-4 text-[22px] font-bold text-gray-900 tracking-tight">Enter password</h1>
            <p className="mt-1 text-sm text-gray-500">
              Signing in as <span className="font-semibold text-gray-700">{identifier}</span>
            </p>
          </div>

          <form onSubmit={handlePasswordLogin} className="space-y-3">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><LockIcon /></span>
              <input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="Your password"
                className={inputClass}
              />
            </div>

            {loginStep === "password" && errorBlock}

            <PrimaryBtn enabled={passwordOk} loading={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </PrimaryBtn>
          </form>

          <button
            type="button"
            onClick={handleSendOtp}
            disabled={loading}
            className="w-full mt-3 text-sm text-[#335CFF] font-semibold hover:underline disabled:opacity-60 bg-transparent border-none p-0 cursor-pointer"
          >
            Use OTP instead
          </button>

          <div className="flex justify-center mt-6">
            <button
              type="button"
              onClick={() => goToStep("identifier")}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              <BackArrow />
              Back
            </button>
          </div>
        </div>

        {/* Panel 3 — OTP */}
        <div className="px-8 py-8 flex-shrink-0 flex flex-col" style={{ width: "33.3333%" }}>
          <div className="flex flex-col items-center text-center mb-7">
            <BrandIcon />
            <h1 className="mt-4 text-[22px] font-bold text-gray-900 tracking-tight">
              {identifierIsEmail ? "Check your email" : "Verify your phone"}
            </h1>
            <p className="mt-1 text-sm text-gray-500 leading-relaxed">
              We sent a 6-digit code to{" "}
              <span className="font-semibold text-gray-700">{identifier}</span>
            </p>
          </div>

          {devCode && (
            <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 text-center">
              Dev mode — code: <span className="font-bold tracking-widest">{devCode}</span>
            </div>
          )}

          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
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
                  className="w-11 h-12 text-center text-xl font-bold border-2 border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#335CFF] focus:ring-2 focus:ring-[#335CFF]/10 bg-white transition-all"
                />
              ))}
            </div>

            {loginStep === "otp" && error && (
              <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 text-center justify-center">
                {error}
              </div>
            )}

            <PrimaryBtn enabled={otpOk} loading={loading}>
              {loading ? "Verifying…" : "Verify & Sign in"}
            </PrimaryBtn>
          </form>

          <div className="flex justify-center mt-5">
            <button
              type="button"
              onClick={() => goToStep("password")}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              <BackArrow />
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
