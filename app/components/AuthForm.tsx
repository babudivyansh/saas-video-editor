"use client";

import { useState, useRef, useEffect } from "react";
import { withNextParam } from "@/lib/safe-redirect";

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

function UserIcon() {
  return (
    <svg className="w-4 h-4 text-fg-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="w-4 h-4 text-fg-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
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
  "w-full pl-10 pr-4 py-3 border border-line hover:border-line-strong focus:border-brand focus:ring-2 focus:ring-brand/10 rounded-xl text-sm text-fg placeholder-fg-subtle focus:outline-none bg-panel transition-all";

// Password input for this form's icon-left layout, with a show/hide toggle.
// None of the four password fields had one, and none set autoComplete, so
// password managers couldn't tell sign-in from sign-up.
function AuthPasswordInput({
  value, onChange, placeholder, autoComplete, required,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  autoComplete: "current-password" | "new-password";
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete={autoComplete}
        className={`${inputClass} pr-11`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-fg-subtle hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {visible ? (
            <><path d="M17.94 17.94A10.1 10.1 0 0 1 12 19c-6.5 0-10-7-10-7a18.4 18.4 0 0 1 5.06-5.94M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" /></>
          ) : (
            <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>
          )}
        </svg>
      </button>
    </>
  );
}

// Panels of the horizontal login slider, in the order they're laid out. "otp"
// is the emailed code; "totp" is the second factor from an authenticator app
// (only reached when the account has 2FA on).
const LOGIN_STEPS = ["identifier", "password", "otp", "totp", "forgot-password"] as const;
type LoginStep = (typeof LOGIN_STEPS)[number];

const CODE_LENGTH = 6;
const emptyDigits = () => Array<string>(CODE_LENGTH).fill("");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/**
 * The 6-box code entry, shared by the emailed-code panels and the 2FA panel.
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

  // Once every box is filled the form submits itself — no reaching for the
  // button after typing (or autofilling) the sixth digit.
  function submitIfComplete(next: string[]) {
    if (next.every((d) => d !== "")) {
      setTimeout(() => refs.current[0]?.form?.requestSubmit(), 0);
    }
  }

  function handleChange(idx: number, val: string) {
    if (!/^\d*$/.test(val)) return;
    // SMS/email autofill (autocomplete="one-time-code") drops the whole code
    // into one box — spread it like a paste instead of keeping the last digit.
    if (val.length > 1) {
      const updated = [...digits];
      val.slice(0, CODE_LENGTH - idx).split("").forEach((ch, i) => { updated[idx + i] = ch; });
      onChange(updated);
      refs.current[Math.min(idx + val.length, CODE_LENGTH - 1)]?.focus();
      submitIfComplete(updated);
      return;
    }
    const updated = [...digits];
    updated[idx] = val.slice(-1);
    onChange(updated);
    if (val && idx < CODE_LENGTH - 1) refs.current[idx + 1]?.focus();
    submitIfComplete(updated);
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
    submitIfComplete(updated);
  }

  return (
    <div role="group" aria-label="Verification code" className="flex justify-center gap-2" onPaste={handlePaste}>
      {digits.map((digit, idx) => (
        <input
          key={idx}
          ref={el => { refs.current[idx] = el; }}
          type="text"
          inputMode="numeric"
          // Only the first box offers autofill; it may receive all six digits.
          autoComplete={idx === 0 ? "one-time-code" : "off"}
          maxLength={idx === 0 ? CODE_LENGTH : 1}
          aria-label={`Digit ${idx + 1} of ${CODE_LENGTH}`}
          value={digit}
          onChange={e => handleChange(idx, e.target.value)}
          onKeyDown={e => handleKeyDown(idx, e)}
          className="w-11 h-12 text-center text-xl font-bold border-2 border-line rounded-xl text-fg focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 bg-panel transition-all"
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
          ? "bg-brand hover:bg-brand-dark active:scale-[0.99] text-on-primary shadow-md shadow-brand/30"
          : "bg-surface-3 text-fg-subtle cursor-not-allowed"
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
  /** Where to return the user after a successful sign-in (email/password AND Google) — see lib/safe-redirect.ts. */
  next?: string | null;
}

export default function AuthForm({
  initialMode,
  onSuccess,
  onModeToggle,
  next,
}: AuthFormProps) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);

  const [loginStep, setLoginStep] = useState<LoginStep>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [otpDigits, setOtpDigits] = useState(emptyDigits);
  const [devCode, setDevCode] = useState<string | null>(null);
  // Issued by /api/auth/register to this browser only; verify must send it
  // back so nobody else can swap in their own password mid-signup.
  const [signupToken, setSignupToken] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  // The code panel doubles as the one-time address check that older, never-
  // verified accounts get after their password (server: requiresEmailVerification).
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  // Returned with requiresEmailVerification; verify-otp only treats the
  // password as proven when this same browser sends it back.
  const [passwordProof, setPasswordProof] = useState<string | null>(null);
  // A deactivated account's login answers "deactivated" — offer the
  // reactivate call with the credentials just typed instead of a dead end.
  const [canReactivate, setCanReactivate] = useState(false);

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
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    referralCode: "",
  });
  // Signup is two steps: the form, then the 6-digit code emailed to prove the
  // address. The account only exists once the code checks out.
  const [regStep, setRegStep] = useState<"form" | "code">("form");
  const [regDigits, setRegDigits] = useState(emptyDigits);
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
        body: JSON.stringify({ code: code.trim(), email: reg.email }),
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
    if (!identifier.trim()) { setError("Enter your email address"); return; }
    setError("");
    setLoginStep("password");
  }

  /** Password login and reactivation answer in the same shapes. */
  function handleLoginResult(data: { requires2fa?: boolean; ticket?: string; requiresEmailVerification?: boolean; passwordProof?: string; devCode?: string; token?: string }) {
    if (data.requires2fa && data.ticket) { startTwoFactor(data.ticket); return; }
    if (data.requiresEmailVerification) {
      setVerifyingEmail(true);
      setPasswordProof(data.passwordProof ?? null);
      setDevCode(data.devCode ?? null);
      setOtpDigits(emptyDigits());
      setCooldown(60);
      setLoginStep("otp");
      return;
    }
    finishAuth(data.token);
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCanReactivate(false);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier.trim(), password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.deactivated) setCanReactivate(true);
        throw new Error(data.error ?? "Login failed");
      }
      handleLoginResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleReactivate() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/account/reactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier.trim(), password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reactivation failed");
      setCanReactivate(false);
      handleLoginResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reactivation failed");
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
        body: JSON.stringify({ email: identifier.trim() }),
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
        body: JSON.stringify({ email: identifier.trim(), otp, ...(passwordProof ? { passwordProof } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      // An emailed code proves the first factor only — an account with 2FA
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
      setDevCode(data.devCode ?? null);
      setSignupToken(data.signupToken ?? null);
      setRegDigits(emptyDigits());
      setCooldown(60);
      setRegStep("code");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifySignup(e: React.FormEvent) {
    e.preventDefault();
    const otp = regDigits.join("");
    if (otp.length < CODE_LENGTH) { setError(`Enter all ${CODE_LENGTH} digits`); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: reg.email.trim(), otp, signupToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        // The pending signup timed out — the code can't work any more, so
        // go back to the (still filled-in) form to submit it again.
        if (data.expired) setRegStep("form");
        setRegDigits(emptyDigits());
        throw new Error(data.error ?? "Verification failed");
      }
      finishAuth(data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendSignupCode() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: reg.email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send code");
      if (data.devCode) setDevCode(data.devCode);
      setRegDigits(emptyDigits());
      setCooldown(60);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send code");
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
    setVerifyingEmail(false);
    setPasswordProof(null);
    setCanReactivate(false);
    setRegStep("form");
    setRegDigits(emptyDigits());
    setTicket(null);
    setTotpDigits(emptyDigits());
    setRecoveryCode("");
    setUseRecoveryCode(false);
    onModeToggle?.(nextMode);
  };

  const errorBlock = error && (
    <div role="alert" className="flex items-start gap-2 text-error text-sm bg-error/10 border border-error/30 rounded-xl px-3.5 py-2.5">
      <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>{error}</span>
    </div>
  );

  const identifierOk = isValidEmail(identifier);
  const passwordOk = loginPassword.length > 0;
  const otpOk = otpDigits.join("").length === CODE_LENGTH;
  const totpOk = useRecoveryCode ? recoveryCode.trim().length > 0 : totpDigits.join("").length === CODE_LENGTH;
  const registerOk =
    reg.name.trim().length > 0 &&
    isValidEmail(reg.email) &&
    reg.password.length >= 8 &&
    reg.password === reg.confirmPassword;

  // ── Register ────────────────────────────────────────────────────────────────
  if (mode === "register" && regStep === "code") {
    return (
      <div className="flex-1 bg-panel px-8 py-8">
        <div className="flex flex-col items-center text-center mb-7">
          <BrandIcon />
          <h1 className="mt-4 text-[22px] font-bold text-fg tracking-tight">Check your email</h1>
          <p className="mt-1 text-sm text-fg-muted leading-relaxed">
            We sent a 6-digit code to <span className="font-semibold text-fg">{reg.email.trim()}</span>.
            Enter it to finish creating your account.
          </p>
        </div>

        {devCode && (
          <div className="mb-4 text-xs text-warning bg-warning/10 border border-warning/30 rounded-xl px-3.5 py-2.5 text-center">
            Dev mode — code: <span className="font-bold tracking-widest">{devCode}</span>
          </div>
        )}

        <form onSubmit={handleVerifySignup} className="space-y-5">
          <DigitBoxes digits={regDigits} onChange={setRegDigits} focused={regStep === "code"} />
          {errorBlock}
          <PrimaryBtn enabled={regDigits.join("").length === CODE_LENGTH} loading={loading}>
            {loading ? "Verifying…" : "Verify & create account"}
          </PrimaryBtn>
        </form>

        <div className="flex justify-between items-center mt-5">
          <button
            type="button"
            onClick={handleResendSignupCode}
            disabled={cooldown > 0 || loading}
            className="text-sm font-semibold text-brand-deep hover:text-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-transparent border-none p-0"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
          <button
            type="button"
            onClick={() => { setError(""); setRegStep("form"); }}
            className="flex items-center gap-1.5 text-sm text-fg-subtle hover:text-fg-muted transition-colors bg-transparent border-none p-0 cursor-pointer"
          >
            <BackArrow />
            Change details
          </button>
        </div>
      </div>
    );
  }

  if (mode === "register") {
    return (
      <div className="flex-1 bg-panel px-8 py-8">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <BrandIcon />
          <h1 className="mt-4 text-[22px] font-bold text-fg tracking-tight">Create your account</h1>
          <p className="mt-1 text-sm text-fg-muted">Start making viral videos with AI today.</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-3">
          {/* Name */}
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><UserIcon /></span>
            <input
              type="text"
              value={reg.name}
              onChange={e => setReg({ ...reg, name: e.target.value })}
              required
              maxLength={60}
              autoComplete="name"
              placeholder="Your name"
              aria-label="Your name"
              className={inputClass}
            />
          </div>

          {/* Email */}
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><MailIcon /></span>
            <input
              type="email"
              value={reg.email}
              onChange={e => setReg({ ...reg, email: e.target.value })}
              required
              autoComplete="email"
              placeholder="Email address"
              aria-label="Email address"
              className={inputClass}
            />
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
                aria-label="Referral code (optional)"
                className={inputClass.replace("pl-10", "pl-4")}
              />
              {checkingCode ? (
                <p className="mt-1 text-xs text-fg-subtle">Checking…</p>
              ) : codeCheck && !codeCheck.valid ? (
                <p className="mt-1 text-xs text-warning">
                  {referralRejectMessages[codeCheck.reason ?? "invalid"] ?? referralRejectMessages.invalid}
                </p>
              ) : codeCheck?.valid && reg.referralCode.trim() ? (
                <p className="mt-1 text-xs text-success">Referral code applied ✓</p>
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
<AuthPasswordInput
                value={reg.password}
                onChange={e => setReg({ ...reg, password: e.target.value })}
                required
                placeholder="Password"
                autoComplete="new-password"
              />
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><LockIcon /></span>
<AuthPasswordInput
                value={reg.confirmPassword}
                onChange={e => setReg({ ...reg, confirmPassword: e.target.value })}
                required
                placeholder="Confirm password"
                autoComplete="new-password"
              />
            </div>
          </div>

          {errorBlock}

          <PrimaryBtn enabled={registerOk} loading={loading}>
            {loading ? "Sending code…" : "Get Started — It's Free"}
          </PrimaryBtn>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-surface-3" />
          <span className="text-xs text-fg-subtle font-medium">or</span>
          <div className="flex-1 h-px bg-surface-3" />
        </div>

        <button
          type="button"
          onClick={() => window.location.href = "/api/auth/google"}
          className="w-full flex items-center justify-center gap-2.5 border border-line hover:border-line-strong hover:bg-surface-2 active:bg-surface-3 rounded-full py-3 text-sm font-medium text-fg transition-all shadow-sm"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <p className="text-center text-[13px] text-fg-muted mt-5">
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
    <div className="flex-1 bg-panel overflow-hidden">
      <div
        // Off-screen panels are inert (below): they used to stay in the tab
        // order, so Tab walked into forms the user couldn't see.
        className="flex transition-transform duration-[450ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
        style={{
          width: `${LOGIN_STEPS.length * 100}%`,
          transform: `translateX(${translateX})`,
        }}
      >
        {/* Panel 1 — identifier */}
        <div className="px-8 py-8 flex-shrink-0" style={panelStyle} inert={loginStep !== "identifier"}>
          <div className="flex flex-col items-center text-center mb-7">
            <BrandIcon />
            <h1 className="mt-4 text-[22px] font-bold text-fg tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-fg-muted">Sign in to your Clipiro account</p>
          </div>

          <form onSubmit={handleIdentifierContinue} className="space-y-3">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <MailIcon />
              </span>
              <input
                type="email"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                required
                autoComplete="email"
                placeholder="Email address"
                aria-label="Email address"
                className={inputClass}
              />
            </div>

            {loginStep === "identifier" && errorBlock}

            <PrimaryBtn enabled={identifierOk} loading={loading}>
              Continue
            </PrimaryBtn>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-surface-3" />
            <span className="text-xs text-fg-subtle font-medium">or</span>
            <div className="flex-1 h-px bg-surface-3" />
          </div>

          <button
            type="button"
            onClick={() => window.location.href = withNextParam("/api/auth/google", next)}
            className="w-full flex items-center justify-center gap-2.5 border border-line hover:border-line-strong hover:bg-surface-2 active:bg-surface-3 rounded-full py-3 text-sm font-medium text-fg transition-all shadow-sm"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <p className="text-center text-[13px] text-fg-muted mt-5">
            Don&apos;t have an account?{" "}
            <button type="button" onClick={toggleMode} className="text-brand-deep font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer">
              Sign up free
            </button>
          </p>
        </div>

        {/* Panel 2 — password */}
        <div className="px-8 py-8 flex-shrink-0" style={panelStyle} inert={loginStep !== "password"}>
          <div className="flex flex-col items-center text-center mb-7">
            <BrandIcon />
            <h1 className="mt-4 text-[22px] font-bold text-fg tracking-tight">Enter password</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Signing in as <span className="font-semibold text-fg">{identifier}</span>
            </p>
          </div>

          <form onSubmit={handlePasswordLogin} className="space-y-3">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><LockIcon /></span>
<AuthPasswordInput
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
              />
            </div>

            {loginStep === "password" && errorBlock}

            {loginStep === "password" && canReactivate && (
              <button
                type="button"
                onClick={handleReactivate}
                disabled={loading}
                className="w-full text-sm font-semibold text-brand-deep border border-line hover:border-line-strong rounded-full py-2.5 disabled:opacity-60 cursor-pointer bg-transparent"
              >
                Reactivate my account
              </button>
            )}

            <PrimaryBtn enabled={passwordOk} loading={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </PrimaryBtn>
          </form>

          <div className="flex items-center justify-between mt-3">
            <button
              type="button"
              onClick={() => { setVerifyingEmail(false); setPasswordProof(null); void handleSendOtp(); }}
              disabled={loading}
              className="text-sm text-brand-deep font-semibold hover:underline disabled:opacity-60 bg-transparent border-none p-0 cursor-pointer"
            >
              Email me a code instead
            </button>
            <button
              type="button"
              onClick={() => {
                setForgotEmail(identifier.trim());
                setForgotSent(false);
                goToStep("forgot-password");
              }}
              className="text-sm text-fg-subtle hover:text-fg-muted transition-colors bg-transparent border-none p-0 cursor-pointer"
            >
              Forgot password?
            </button>
          </div>

          <div className="flex justify-center mt-6">
            <button
              type="button"
              onClick={() => goToStep("identifier")}
              className="flex items-center gap-1.5 text-sm text-fg-subtle hover:text-fg-muted transition-colors"
            >
              <BackArrow />
              Back
            </button>
          </div>
        </div>

        {/* Panel 3 — OTP */}
        <div className="px-8 py-8 flex-shrink-0 flex flex-col" style={panelStyle} inert={loginStep !== "otp"}>
          <div className="flex flex-col items-center text-center mb-7">
            <BrandIcon />
            <h1 className="mt-4 text-[22px] font-bold text-fg tracking-tight">
              {verifyingEmail ? "Verify your email" : "Check your email"}
            </h1>
            <p className="mt-1 text-sm text-fg-muted leading-relaxed">
              We sent a 6-digit code to{" "}
              <span className="font-semibold text-fg">{identifier}</span>
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
              <div className="flex items-start gap-2 text-error text-sm bg-error/10 border border-error/30 rounded-xl px-3.5 py-2.5 text-center justify-center">
                {error}
              </div>
            )}

            <PrimaryBtn enabled={otpOk} loading={loading}>
              {loading ? "Verifying…" : verifyingEmail ? "Verify & continue" : "Verify & Sign in"}
            </PrimaryBtn>
          </form>

          <div className="flex justify-between items-center mt-5">
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={cooldown > 0 || loading}
              className="text-sm font-semibold text-brand-deep hover:text-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-transparent border-none p-0"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>

            <button
              type="button"
              onClick={() => goToStep("password")}
              className="flex items-center gap-1.5 text-sm text-fg-subtle hover:text-fg-muted transition-colors bg-transparent border-none p-0 cursor-pointer"
            >
              <BackArrow />
              Back
            </button>
          </div>
        </div>

        {/* Panel 4 — two-factor authentication */}
        <div className="px-8 py-8 flex-shrink-0 flex flex-col" style={panelStyle} inert={loginStep !== "totp"}>
          <div className="flex flex-col items-center text-center mb-7">
            <BrandIcon />
            <h1 className="mt-4 text-[22px] font-bold text-fg tracking-tight">Two-factor authentication</h1>
            <p className="mt-1 text-sm text-fg-muted leading-relaxed">
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
                aria-label="Recovery code"
                className="w-full px-4 py-3 border-2 border-line rounded-xl text-center text-lg font-mono tracking-[0.2em] text-fg placeholder-fg-subtle focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 bg-panel transition-all"
              />
            ) : (
              <DigitBoxes
                digits={totpDigits}
                onChange={setTotpDigits}
                focused={loginStep === "totp" && !useRecoveryCode}
              />
            )}

            {loginStep === "totp" && error && (
              <div className="flex items-start gap-2 text-error text-sm bg-error/10 border border-error/30 rounded-xl px-3.5 py-2.5 text-center justify-center">
                {error}
              </div>
            )}

            <PrimaryBtn enabled={totpOk} loading={loading}>
              {loading ? "Verifying…" : verifyingEmail ? "Verify & continue" : "Verify & Sign in"}
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
              className="flex items-center gap-1.5 text-sm text-fg-subtle hover:text-fg-muted transition-colors bg-transparent border-none p-0 cursor-pointer"
            >
              <BackArrow />
              Back
            </button>
          </div>
        </div>

        {/* Panel 5 — forgot password */}
        <div className="px-8 py-8 flex-shrink-0" style={panelStyle} inert={loginStep !== "forgot-password"}>
          {forgotSent ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-tint-blue flex items-center justify-center mx-auto">
                <MailIcon />
              </div>
              <h1 className="mt-4 text-[22px] font-bold text-fg tracking-tight">Check your email</h1>
              <p className="mt-2 text-sm text-fg-muted leading-relaxed">
                If <span className="font-semibold text-fg">{forgotEmail}</span> is registered, we&apos;ve sent a password reset link. Check your inbox (and spam folder).
              </p>
              <p className="mt-1 text-xs text-fg-subtle">The link expires in 15 minutes.</p>

              <div className="flex justify-center mt-6">
                <button
                  type="button"
                  onClick={() => goToStep("password")}
                  className="flex items-center gap-1.5 text-sm text-fg-subtle hover:text-fg-muted transition-colors bg-transparent border-none p-0 cursor-pointer"
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
                <h1 className="mt-4 text-[22px] font-bold text-fg tracking-tight">Forgot password?</h1>
                <p className="mt-1 text-sm text-fg-muted">Enter your email and we&apos;ll send you a reset link.</p>
              </div>

              <form onSubmit={handleForgotPassword} className="space-y-3">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><MailIcon /></span>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="Email address"
                    aria-label="Email address"
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
                  className="flex items-center gap-1.5 text-sm text-fg-subtle hover:text-fg-muted transition-colors bg-transparent border-none p-0 cursor-pointer"
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
