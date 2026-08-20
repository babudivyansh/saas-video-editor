"use client";

import { useState, useRef, useEffect } from "react";

function BrandIcon() {
  return <img src="/icon.png" alt="Clipiro" className="w-12 h-12 rounded-2xl" />;
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
  "w-full pl-10 pr-4 py-3 border border-gray-200 hover:border-gray-300 focus:border-brand focus:ring-2 focus:ring-brand/10 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-white transition-all";

// Panels of the horizontal login slider, in the order they're laid out. "otp"
// is the email/SMS code; "totp" is the second factor from an authenticator app
// (only reached when the account has 2FA on).
const LOGIN_STEPS = ["identifier", "password", "otp", "totp", "forgot-password"] as const;
type LoginStep = (typeof LOGIN_STEPS)[number];

const CODE_LENGTH = 6;
const emptyDigits = () => Array<string>(CODE_LENGTH).fill("");

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

/**
 * The 6-box code entry, shared by the email/SMS OTP panel and the 2FA panel.
 * One implementation of the auto-advance / backspace / paste behaviour rather
 * than a copy per panel, which is how the two would quietly drift apart.
 *
 * `focused` drives the initial focus: it fires once the owning panel becomes
 * the active one.
 */
function DigitBoxes({
  digits,
  onChange,
  focused,
}: {
  digits: string[];
  onChange: (next: string[]) => void;
  focused: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!focused) return;
    // Wait out the 0.45s panel slide — focusing mid-transition makes the
    // browser scroll the still-offscreen panel into view.
    const timer = setTimeout(() => refs.current[0]?.focus(), 460);
    return () => clearTimeout(timer);
  }, [focused]);

  function handleChange(idx: number, val: string) {
    if (!/^\d*$/.test(val)) return;
    const updated = [...digits];
    updated[idx] = val.slice(-1);
    onChange(updated);
    if (val && idx < CODE_LENGTH - 1) refs.current[idx + 1]?.focus();
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) refs.current[idx - 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const updated = [...digits];
    pasted.split("").forEach((ch, i) => { if (i < CODE_LENGTH) updated[i] = ch; });
    onChange(updated);
    refs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  }

  return (
    <div className="flex justify-center gap-2" onPaste={handlePaste}>
      {digits.map((digit, idx) => (
        <input
          key={idx}
          ref={el => { refs.current[idx] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={e => handleChange(idx, e.target.value)}
          onKeyDown={e => handleKeyDown(idx, e)}
          className="w-11 h-12 text-center text-xl font-bold border-2 border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 bg-white transition-all"
        />
      ))}
    </div>
  );
}

function PrimaryBtn({ enabled, loading, children }: { enabled: boolean; loading?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={!enabled || loading}
      className={`w-full font-semibold py-3 rounded-full text-sm transition-all flex items-center justify-center gap-2 ${
        enabled && !loading
          ? "bg-brand hover:bg-brand-dark active:scale-[0.99] text-white shadow-md shadow-brand/30"
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
  const [otpDigits, setOtpDigits] = useState(emptyDigits);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Second factor: the ticket the server minted after the password (or OTP, or
  // Google) checked out, exchanged for a real session by /api/auth/2fa/verify-login.
  const [ticket, setTicket] = useState<string | null>(null);
  const [totpDigits, setTotpDigits] = useState(emptyDigits);
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const [reg, setReg] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    referralCode: "",
  });
  const [showReferralField, setShowReferralField] = useState(false);
  const [codeCheck, setCodeCheck] = useState<{ valid: boolean; reason?: string } | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => { setMode(initialMode); }, [initialMode]);

  // Google's callback is a full browser navigation, not a fetch, so it can't
  // answer with `requires2fa` JSON — it redirects back here with the ticket in
  // the query string instead (app/api/auth/callback/google/route.ts). Read
  // straight from location rather than useSearchParams: this runs client-side
  // only and needs no Suspense boundary.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleTicket = params.get("2fa");
    const oauthError = params.get("error");
    if (!googleTicket && !oauthError) return;

    if (googleTicket) {
      setTicket(googleTicket);
      setTotpDigits(emptyDigits());
      setLoginStep("totp");
    } else if (oauthError === "suspended") {
      setError("This account has been suspended. Contact support if you believe this is a mistake.");
    } else if (oauthError === "deactivated") {
      setError("This account is deactivated.");
    } else if (oauthError === "oauth_state") {
      setError("Google sign-in could not be verified. Please try again.");
    }
    // Don't leave a single-use ticket sitting in the address bar / history.
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // A referral link lands here as /register?ref=CODE. affiliate_ref itself is
  // an httpOnly cookie proxy.ts already set (invisible to this component) and
  // is what the server actually attributes against regardless of what this
  // field shows — this just pre-fills the visible field for a link-click
  // signup so the user sees it was recognized, and auto-checks it.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (!ref) return;
    setReg((r) => ({ ...r, referralCode: ref }));
    setShowReferralField(true);
  }, []);

  async function checkReferralCode(code: string) {
    if (!code.trim()) { setCodeCheck(null); return; }
    setCheckingCode(true);
    try {
      const res = await fetch("/api/affiliate/validate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), email: reg.email, phone: reg.phone }),
      });
      const data = await res.json();
      if (!res.ok) { setCodeCheck(null); return; }
      setCodeCheck(data);
    } catch {
      setCodeCheck(null);
    } finally {
      setCheckingCode(false);
    }
  }

  useEffect(() => {
    if (showReferralField && reg.referralCode.trim()) checkReferralCode(reg.referralCode);
    // Only re-run for the initial ?ref= prefill — further checks are onBlur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReferralField]);

  const referralRejectMessages: Record<string, string> = {
    invalid: "This referral code doesn't exist. Double-check it or leave it blank.",
    expired: "This referral code has expired.",
    self: "You can't use your own referral code.",
    duplicate: "You already have a referral applied from a link you clicked earlier — this code was ignored.",
  };

  function finishAuth(token: string | undefined) {
    // A 200 with no token means the server paused the login (2FA) and the
    // caller failed to handle it. Previously this stored the string
    // "undefined" and bounced the user around a redirect loop with no error.
    if (!token) throw new Error("Sign-in did not complete. Please try again.");
    localStorage.setItem("token", token);
    onSuccess?.(token);
  }

  /** Shared by every entry point that can pause for a second factor. */
  function startTwoFactor(nextTicket: string) {
    setTicket(nextTicket);
    setTotpDigits(emptyDigits());
    setRecoveryCode("");
    setUseRecoveryCode(false);
    setError("");
    setLoginStep("totp");
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
      if (data.requires2fa) { startTwoFactor(data.ticket); return; }
      finishAuth(data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Something went wrong.");
      }
      setForgotSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
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
      setOtpDigits(emptyDigits());
      setLoginStep("otp");
      setCooldown(60);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const otp = otpDigits.join("");
    if (otp.length < CODE_LENGTH) { setError(`Enter all ${CODE_LENGTH} digits`); return; }
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
      // An emailed/SMS code proves the first factor only — an account with 2FA
      // on still has to produce an authenticator code.
      if (data.requires2fa) { startTwoFactor(data.ticket); return; }
      finishAuth(data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyTotp(e: React.FormEvent) {
    e.preventDefault();
    const code = useRecoveryCode ? recoveryCode.trim() : totpDigits.join("");
    if (!code) { setError("Enter your code"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/verify-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        // The ticket is gone — timed out, or spent by too many wrong codes.
        // Nothing on this panel can succeed any more, so go back a step
        // instead of letting them keep typing into a dead form.
        if (data.expired) {
          setTicket(null);
          setTotpDigits(emptyDigits());
          setRecoveryCode("");
          setLoginStep("password");
        } else {
          setTotpDigits(emptyDigits());
        }
        throw new Error(data.error ?? "Verification failed");
      }
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
      const { referralCode, ...baseReg } = reg;
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(showReferralField ? { ...baseReg, referralCode: referralCode.trim() } : baseReg),
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

  function goToStep(step: LoginStep) { setError(""); setLoginStep(step); }

  const toggleMode = () => {
    const nextMode = mode === "login" ? "register" : "login";
    setMode(nextMode);
    setError("");
    setLoginStep("identifier");
    setLoginPassword("");
    setOtpDigits(emptyDigits());
    setDevCode(null);
    setTicket(null);
    setTotpDigits(emptyDigits());
    setRecoveryCode("");
    setUseRecoveryCode(false);
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
  const otpOk = otpDigits.join("").length === CODE_LENGTH;
  const totpOk = useRecoveryCode ? recoveryCode.trim().length > 0 : totpDigits.join("").length === CODE_LENGTH;
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          {/* Phone — required (used for sign-in and account security), but
              nothing else on the page said so, so a filled-out form with an
              empty/invalid phone left the submit button permanently inert
              with no explanation. This hint is the fix. */}
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><PhoneIcon /></span>
            <input
              type="tel"
              value={reg.phone}
              onChange={e => setReg({ ...reg, phone: e.target.value })}
              required
              placeholder="Phone number (+91...)"
              aria-required="true"
              className={inputClass}
            />
            {reg.phone.trim() === "" ? (
              <p className="mt-1 text-xs text-gray-400">Required — used for sign-in and account security</p>
            ) : !isValidPhone(reg.phone) ? (
              <p className="mt-1 text-xs text-red-600">Enter a valid phone number (7–15 digits)</p>
            ) : null}
          </div>

          {/* Referral code — collapsed by default; auto-expands from ?ref= */}
          {showReferralField ? (
            <div>
              <input
                type="text"
                value={reg.referralCode}
                onChange={e => { setReg({ ...reg, referralCode: e.target.value }); setCodeCheck(null); }}
                onBlur={e => checkReferralCode(e.target.value)}
                placeholder="Referral code (optional)"
                className={inputClass.replace("pl-10", "pl-4")}
              />
              {checkingCode ? (
                <p className="mt-1 text-xs text-gray-400">Checking…</p>
              ) : codeCheck && !codeCheck.valid ? (
                <p className="mt-1 text-xs text-amber-600">
                  {referralRejectMessages[codeCheck.reason ?? "invalid"] ?? referralRejectMessages.invalid}
                </p>
              ) : codeCheck?.valid && reg.referralCode.trim() ? (
                <p className="mt-1 text-xs text-green-600">Referral code applied ✓</p>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowReferralField(true)}
              className="text-[13px] text-brand-deep font-medium hover:underline bg-transparent border-none p-0 cursor-pointer"
            >
              Have a referral code?
            </button>
          )}

          {/* Password row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            {loading ? "Creating account…" : "Get Started — It's Free"}
          </PrimaryBtn>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-400 font-medium">or</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        <button
          type="button"
          onClick={() => window.location.href = "/api/auth/google"}
          className="w-full flex items-center justify-center gap-2.5 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100 rounded-full py-3 text-sm font-medium text-gray-700 transition-all shadow-sm"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <p className="text-center text-[13px] text-gray-500 mt-5">
          Already have an account?{" "}
          <button type="button" onClick={toggleMode} className="text-brand-deep font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer">
            Sign in
          </button>
        </p>
      </div>
    );
  }

  // ── Login slider ────────────────────────────────────────────────────────────
  // One track holding every panel side by side, shifted one panel-width per
  // step. Derived from LOGIN_STEPS rather than hard-coded thirds, so adding a
  // panel (as the 2FA step did) can't leave the widths and the offsets
  // disagreeing.
  const panelWidth = 100 / LOGIN_STEPS.length;
  const translateX = `-${LOGIN_STEPS.indexOf(loginStep) * panelWidth}%`;
  const panelStyle = { width: `${panelWidth}%` };

  return (
    <div className="flex-1 bg-white overflow-hidden">
      <div
        className="flex"
        style={{
          width: `${LOGIN_STEPS.length * 100}%`,
          transform: `translateX(${translateX})`,
          transition: "transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* Panel 1 — identifier */}
        <div className="px-8 py-8 flex-shrink-0" style={panelStyle}>
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
            onClick={() => window.location.href = "/api/auth/google"}
            className="w-full flex items-center justify-center gap-2.5 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100 rounded-full py-3 text-sm font-medium text-gray-700 transition-all shadow-sm"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <p className="text-center text-[13px] text-gray-500 mt-5">
            Don&apos;t have an account?{" "}
            <button type="button" onClick={toggleMode} className="text-brand-deep font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer">
              Sign up free
            </button>
          </p>
        </div>

        {/* Panel 2 — password */}
        <div className="px-8 py-8 flex-shrink-0" style={panelStyle}>
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

          <div className="flex items-center justify-between mt-3">
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={loading}
              className="text-sm text-brand-deep font-semibold hover:underline disabled:opacity-60 bg-transparent border-none p-0 cursor-pointer"
            >
              Use OTP instead
            </button>
            <button
              type="button"
              onClick={() => {
                setForgotEmail(identifierIsEmail ? identifier : "");
                setForgotSent(false);
                goToStep("forgot-password");
              }}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors bg-transparent border-none p-0 cursor-pointer"
            >
              Forgot password?
            </button>
          </div>

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
        <div className="px-8 py-8 flex-shrink-0 flex flex-col" style={panelStyle}>
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
            <DigitBoxes digits={otpDigits} onChange={setOtpDigits} focused={loginStep === "otp"} />

            {loginStep === "otp" && error && (
              <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 text-center justify-center">
                {error}
              </div>
            )}

            <PrimaryBtn enabled={otpOk} loading={loading}>
              {loading ? "Verifying…" : "Verify & Sign in"}
            </PrimaryBtn>
          </form>

          <div className="flex justify-between items-center mt-5">
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={cooldown > 0 || loading}
              className="text-sm font-semibold text-brand-deep hover:text-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-transparent border-none p-0"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
            </button>

            <button
              type="button"
              onClick={() => goToStep("password")}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors bg-transparent border-none p-0 cursor-pointer"
            >
              <BackArrow />
              Back
            </button>
          </div>
        </div>

        {/* Panel 4 — two-factor authentication */}
        <div className="px-8 py-8 flex-shrink-0 flex flex-col" style={panelStyle}>
          <div className="flex flex-col items-center text-center mb-7">
            <BrandIcon />
            <h1 className="mt-4 text-[22px] font-bold text-gray-900 tracking-tight">Two-factor authentication</h1>
            <p className="mt-1 text-sm text-gray-500 leading-relaxed">
              {useRecoveryCode
                ? "Enter one of the recovery codes you saved when you turned on 2FA."
                : "Enter the 6-digit code from your authenticator app."}
            </p>
          </div>

          <form onSubmit={handleVerifyTotp} className="space-y-5">
            {useRecoveryCode ? (
              <input
                type="text"
                autoComplete="one-time-code"
                value={recoveryCode}
                onChange={e => setRecoveryCode(e.target.value.toUpperCase())}
                placeholder="XXXXX-XXXXX"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-center text-lg font-mono tracking-[0.2em] text-gray-900 placeholder-gray-300 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 bg-white transition-all"
              />
            ) : (
              <DigitBoxes
                digits={totpDigits}
                onChange={setTotpDigits}
                focused={loginStep === "totp" && !useRecoveryCode}
              />
            )}

            {loginStep === "totp" && error && (
              <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 text-center justify-center">
                {error}
              </div>
            )}

            <PrimaryBtn enabled={totpOk} loading={loading}>
              {loading ? "Verifying…" : "Verify & Sign in"}
            </PrimaryBtn>
          </form>

          <div className="flex justify-between items-center mt-5">
            <button
              type="button"
              onClick={() => {
                setUseRecoveryCode(v => !v);
                setError("");
                setTotpDigits(emptyDigits());
                setRecoveryCode("");
              }}
              className="text-sm font-semibold text-brand-deep hover:text-brand-dark transition-colors cursor-pointer bg-transparent border-none p-0"
            >
              {useRecoveryCode ? "Use authenticator app" : "Use a recovery code"}
            </button>

            <button
              type="button"
              onClick={() => { setTicket(null); goToStep("password"); }}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors bg-transparent border-none p-0 cursor-pointer"
            >
              <BackArrow />
              Back
            </button>
          </div>
        </div>

        {/* Panel 5 — forgot password */}
        <div className="px-8 py-8 flex-shrink-0" style={panelStyle}>
          {forgotSent ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-tint-blue flex items-center justify-center mx-auto">
                <MailIcon />
              </div>
              <h1 className="mt-4 text-[22px] font-bold text-gray-900 tracking-tight">Check your email</h1>
              <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                If <span className="font-semibold text-gray-700">{forgotEmail}</span> is registered, we&apos;ve sent a password reset link. Check your inbox (and spam folder).
              </p>
              <p className="mt-1 text-xs text-gray-400">The link expires in 15 minutes.</p>

              <div className="flex justify-center mt-6">
                <button
                  type="button"
                  onClick={() => goToStep("password")}
                  className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors bg-transparent border-none p-0 cursor-pointer"
                >
                  <BackArrow />
                  Back to login
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center text-center mb-7">
                <BrandIcon />
                <h1 className="mt-4 text-[22px] font-bold text-gray-900 tracking-tight">Forgot password?</h1>
                <p className="mt-1 text-sm text-gray-500">Enter your email and we&apos;ll send you a reset link.</p>
              </div>

              <form onSubmit={handleForgotPassword} className="space-y-3">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><MailIcon /></span>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    required
                    placeholder="Email address"
                    className={inputClass}
                  />
                </div>

                {loginStep === "forgot-password" && errorBlock}

                <PrimaryBtn enabled={isValidEmail(forgotEmail)} loading={loading}>
                  {loading ? "Sending…" : "Send reset link"}
                </PrimaryBtn>
              </form>

              <div className="flex justify-center mt-6">
                <button
                  type="button"
                  onClick={() => goToStep("password")}
                  className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors bg-transparent border-none p-0 cursor-pointer"
                >
                  <BackArrow />
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
