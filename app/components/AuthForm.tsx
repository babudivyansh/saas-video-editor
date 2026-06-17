"use client";

import { useState, useRef, useEffect } from "react";

function DoorIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 10H13C12.4477 10 12 10.4477 12 11V29C12 29.5523 12.4477 30 13 30H22" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M22 10L28 13V27L22 30V10Z" fill="#2563EB" fillOpacity="0.15" stroke="#2563EB" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="25" cy="20" r="1.5" fill="#2563EB" />
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

function PhoneIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function BackArrow() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
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

const inputClass =
  "w-full pl-10 pr-4 py-3 border border-gray-300 hover:border-gray-400 focus:border-black focus:ring-0 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-white transition-colors";

type LoginStep = "identifier" | "password" | "otp";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email if it contains "@", otherwise treated as a phone number. */
function detectMethod(identifier: string): "email" | "phone" {
  return identifier.includes("@") ? "email" : "phone";
}

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

function isValidPhone(value: string): boolean {
  return /^\+?[0-9]{7,15}$/.test(value.trim().replace(/[\s-]/g, ""));
}

/** A single field is valid if it's a well-formed email or a well-formed phone. */
function isValidIdentifier(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return v.includes("@") ? isValidEmail(v) : isValidPhone(v);
}

/** Primary button styling: highlighted when ready, muted/disabled otherwise. */
function primaryBtn(enabled: boolean): string {
  const base = "w-full font-semibold py-3 rounded-lg transition-colors text-sm";
  return enabled
    ? `${base} bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-md shadow-indigo-200 disabled:opacity-70`
    : `${base} bg-gray-200 text-gray-400 cursor-not-allowed`;
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

  // Login slider state
  const [loginStep, setLoginStep] = useState<LoginStep>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [devCode, setDevCode] = useState<string | null>(null);

  // Register state
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

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

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

  // Step 1 → 2: collect identifier, slide to password.
  function handleIdentifierContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) {
      setError("Enter your email or phone number");
      return;
    }
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

  // Password step → OTP step: request a code, then slide to OTP.
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
    if (otp.length < 6) {
      setError("Enter all 6 digits");
      return;
    }
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
    if (reg.password !== reg.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (reg.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
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

  function goToStep(step: LoginStep) {
    setError("");
    setLoginStep(step);
  }

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
    <p className="text-red-500 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
  );

  // Validity → drives whether the primary button is highlighted or muted.
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

  // ── Register screen ────────────────────────────────────────────────────────
  if (mode === "register") {
    return (
      <div className="flex-1 bg-white px-10 py-10">
        <div className="flex flex-col items-center text-center mb-6">
          <DoorIcon />
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Create an account</h1>
          <p className="mt-1 text-sm text-gray-500">Start making videos with AI today.</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">First name</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2"><UserIcon /></span>
                <input
                  type="text"
                  value={reg.firstName}
                  onChange={e => setReg({ ...reg, firstName: e.target.value })}
                  required
                  placeholder="Jane"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Last name</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2"><UserIcon /></span>
                <input
                  type="text"
                  value={reg.lastName}
                  onChange={e => setReg({ ...reg, lastName: e.target.value })}
                  required
                  placeholder="Doe"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2"><MailIcon /></span>
              <input
                type="email"
                value={reg.email}
                onChange={e => setReg({ ...reg, email: e.target.value })}
                required
                placeholder="example@gmail.com"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone number</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2"><PhoneIcon /></span>
              <input
                type="tel"
                value={reg.phone}
                onChange={e => setReg({ ...reg, phone: e.target.value })}
                required
                placeholder="+91 98765 43210"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2"><LockIcon /></span>
                <input
                  type="password"
                  value={reg.password}
                  onChange={e => setReg({ ...reg, password: e.target.value })}
                  required
                  placeholder="Min. 8 characters"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2"><LockIcon /></span>
                <input
                  type="password"
                  value={reg.confirmPassword}
                  onChange={e => setReg({ ...reg, confirmPassword: e.target.value })}
                  required
                  placeholder="Re-enter"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {errorBlock}

          <button
            type="submit"
            disabled={!registerOk || loading}
            className={primaryBtn(registerOk)}
          >
            {loading ? "Creating account…" : "Sign up"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-5">
          Already have an account?{" "}
          <button
            type="button"
            onClick={toggleMode}
            className="text-[#2563eb] font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer"
          >
            Login
          </button>
        </p>
      </div>
    );
  }

  // ── Login slider: identifier → password → OTP ──────────────────────────────
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
        {/* Panel 1 — identifier (email or phone) */}
        <div className="px-10 py-10 flex-shrink-0" style={{ width: "33.3333%" }}>
          <div className="flex flex-col items-center text-center mb-7">
            <DoorIcon />
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Login to proceed</h1>
            <p className="mt-1 text-sm text-gray-500">We missed you! Welcome back :)</p>
          </div>

          <form onSubmit={handleIdentifierContinue} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email or phone number</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2">
                  {identifierIsEmail ? <MailIcon /> : <PhoneIcon />}
                </span>
                <input
                  type="text"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>
            </div>

            {loginStep === "identifier" && errorBlock}

            <button
              type="submit"
              disabled={!identifierOk || loading}
              className={primaryBtn(identifierOk)}
            >
              Continue
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">OR</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <button
            type="button"
            onClick={() => alert("Google sign-in coming soon!")}
            className="w-full flex items-center justify-center gap-2.5 border border-gray-200 hover:bg-gray-50 active:bg-gray-100 rounded-lg py-3 text-sm font-medium text-gray-700 transition-colors shadow-sm"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <p className="text-center text-sm text-gray-500 mt-5">
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={toggleMode}
              className="text-[#2563eb] font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer"
            >
              Sign up
            </button>
          </p>
        </div>

        {/* Panel 2 — password */}
        <div className="px-10 py-10 flex-shrink-0" style={{ width: "33.3333%" }}>
          <div className="flex flex-col items-center text-center mb-7">
            <DoorIcon />
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Enter your password</h1>
            <p className="mt-1 text-sm text-gray-500 leading-relaxed">
              Signing in as<br />
              <span className="font-medium text-gray-700">{identifier}</span>
            </p>
          </div>

          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2"><LockIcon /></span>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="Your password"
                  className={inputClass}
                />
              </div>
            </div>

            {loginStep === "password" && errorBlock}

            <button
              type="submit"
              disabled={!passwordOk || loading}
              className={primaryBtn(passwordOk)}
            >
              {loading ? "Signing in…" : "Login"}
            </button>
          </form>

          <button
            type="button"
            onClick={handleSendOtp}
            disabled={loading}
            className="w-full mt-3 text-sm text-[#2563eb] font-semibold hover:underline disabled:opacity-60 bg-transparent border-none p-0 cursor-pointer"
          >
            Sign in using OTP instead
          </button>

          <button
            type="button"
            onClick={() => goToStep("identifier")}
            className="mt-6 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mx-auto"
          >
            <BackArrow />
            Back
          </button>
        </div>

        {/* Panel 3 — OTP */}
        <div className="px-10 py-10 flex-shrink-0 flex flex-col" style={{ width: "33.3333%" }}>
          <div className="flex flex-col items-center text-center mb-7">
            <DoorIcon />
            <h1 className="mt-4 text-2xl font-bold text-gray-900">
              {identifierIsEmail ? "Verify your email" : "Verify your phone"}
            </h1>
            <p className="mt-1 text-sm text-gray-500 leading-relaxed">
              We&apos;ve sent a six-digit code to<br />
              <span className="font-medium text-gray-700">{identifier}</span>
            </p>
          </div>

          {devCode && (
            <p className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
              Dev mode (no provider configured) — your code is <span className="font-bold tracking-widest">{devCode}</span>
            </p>
          )}

          <form onSubmit={handleVerifyOtp} className="space-y-5">
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

            {loginStep === "otp" && error && (
              <p className="text-red-500 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={!otpOk || loading}
              className={primaryBtn(otpOk)}
            >
              {loading ? "Verifying…" : "Verify & Sign in"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => goToStep("password")}
            className="mt-5 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mx-auto"
          >
            <BackArrow />
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
