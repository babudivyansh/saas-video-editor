"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { Card } from "@/app/components/ui/Card";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";

function IcSpinner() { return <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />; }
function IcCheck() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M5 13l4 4L19 7" /></svg>; }
function IcCopy() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>; }

const inputCls = "w-full bg-white border border-card-border rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-soft/50 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all";
const labelCls = "text-xs font-semibold text-ink-soft uppercase tracking-wide block mb-1.5";

interface TwoFaStatus { enabled: boolean; unusedRecoveryCodes: number }

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${ok ? "bg-tint-emerald text-green-700" : "bg-amber-100 text-amber-700"}`}>
      {children}
    </span>
  );
}

function EmailSection() {
  const { user, token } = useAuth();
  const { showToast } = useToast();
  const [sendingVerify, setSendingVerify] = useState(false);
  const [changing, setChanging] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  async function sendVerification() {
    setSendingVerify(true);
    try {
      const res = await fetch("/api/auth/verify-email/send", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Failed to send", "error"); return; }
      showToast(data.alreadyVerified ? "Already verified" : "Verification email sent");
    } finally {
      setSendingVerify(false);
    }
  }

  async function submitChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Failed to change email", "error"); return; }
      setPendingEmail(data.pendingEmail);
      setChanging(false);
      setPassword("");
      showToast(`Confirmation sent to ${data.pendingEmail}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card padding="md" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-extrabold text-ink">Email</h2>
        <Badge ok={!!user?.emailVerifiedAt}>{user?.emailVerifiedAt ? "Verified" : "Unverified"}</Badge>
      </div>
      <div>
        <label className={labelCls}>Email Address</label>
        <div className="flex items-center gap-2 bg-surface border border-card-border rounded-xl px-4 py-3">
          <span className="text-sm text-gray-700 flex-1 truncate">{user?.email ?? "—"}</span>
        </div>
        {pendingEmail && <p className="text-xs text-amber-700 mt-2">Confirmation sent to <strong>{pendingEmail}</strong> — click the link there to finish the change.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {!user?.emailVerifiedAt && (
          <Button variant="secondary" size="sm" onClick={sendVerification} disabled={sendingVerify}>
            {sendingVerify ? <><IcSpinner /> Sending…</> : "Send verification email"}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => setChanging((c) => !c)}>{changing ? "Cancel" : "Change email"}</Button>
      </div>

      {changing && (
        <form onSubmit={submitChangeEmail} className="space-y-3 pt-2 border-t border-card-border">
          <div>
            <label className={labelCls}>New email address</label>
            <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Current password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Confirm it's you" className={inputCls} />
          </div>
          <Button type="submit" size="sm" disabled={submitting}>{submitting ? <><IcSpinner /> Sending…</> : "Send confirmation"}</Button>
        </form>
      )}
    </Card>
  );
}

function PasswordSection() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) { showToast("New passwords do not match", "error"); return; }
    if (newPw.length < 8) { showToast("Password must be at least 8 characters", "error"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Password updated — every other device has been signed out");
        setCurrentPw(""); setNewPw(""); setConfirmPw(""); setOpen(false);
      } else {
        showToast(data.error ?? "Failed to update password", "error");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card padding="md">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-extrabold text-ink">Password</h2>
        <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>{open ? "Cancel" : "Change password"}</Button>
      </div>
      {!open ? (
        <p className="mt-3 text-sm tracking-widest text-gray-400">••••••••</p>
      ) : (
        <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
          {[
            { label: "Current Password", value: currentPw, setter: setCurrentPw, placeholder: "Enter current password" },
            { label: "New Password", value: newPw, setter: setNewPw, placeholder: "At least 8 characters" },
            { label: "Confirm New Password", value: confirmPw, setter: setConfirmPw, placeholder: "Repeat new password" },
          ].map((f) => (
            <div key={f.label}>
              <label className={labelCls}>{f.label}</label>
              <input type="password" value={f.value} onChange={(e) => f.setter(e.target.value)} placeholder={f.placeholder} required className={inputCls} />
            </div>
          ))}
          <Button type="submit" disabled={loading}>{loading ? <><IcSpinner /> Updating…</> : "Update Password"}</Button>
        </form>
      )}
    </Card>
  );
}

function TwoFactorSection() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [status, setStatus] = useState<TwoFaStatus | null>(null);

  const [setupOpen, setSetupOpen] = useState(false);
  const [setupStep, setSetupStep] = useState<"password" | "scan" | "codes">("password");
  const [setupPassword, setSetupPassword] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");

  const loadStatus = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/auth/2fa/status", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setStatus(await res.json());
  }, [token]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  function resetSetup() {
    setSetupOpen(false); setSetupStep("password"); setSetupPassword("");
    setQrDataUrl(null); setSecret(null); setCode(""); setRecoveryCodes([]);
  }

  async function startSetup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: setupPassword }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Failed to start setup", "error"); return; }
      setQrDataUrl(data.qrDataUrl); setSecret(data.secret); setSetupStep("scan");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Invalid code", "error"); return; }
      setRecoveryCodes(data.recoveryCodes); setSetupStep("codes");
      await loadStatus();
    } finally {
      setBusy(false);
    }
  }

  async function disable2fa(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: disablePassword }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Failed to disable", "error"); return; }
      showToast("Two-factor authentication disabled");
      setDisableOpen(false); setDisablePassword("");
      await loadStatus();
    } finally {
      setBusy(false);
    }
  }

  function copyRecoveryCodes() {
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    showToast("Recovery codes copied");
  }

  return (
    <Card padding="md">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-extrabold text-ink">Two-factor authentication</h2>
        {status && <Badge ok={status.enabled}>{status.enabled ? "Enabled" : "Disabled"}</Badge>}
      </div>
      <p className="text-sm text-ink-soft mt-2">
        {status?.enabled
          ? `Your account requires a code from your authenticator app to sign in. ${status.unusedRecoveryCodes} recovery code${status.unusedRecoveryCodes === 1 ? "" : "s"} remaining.`
          : "Add an authenticator app as a second step when signing in."}
      </p>
      <div className="mt-4">
        {status?.enabled ? (
          <Button variant="secondary" size="sm" onClick={() => setDisableOpen(true)} className="!text-red-600">Disable 2FA</Button>
        ) : (
          <Button size="sm" onClick={() => setSetupOpen(true)}>Enable 2FA</Button>
        )}
      </div>

      <Modal open={setupOpen} onClose={resetSetup} title="Set up two-factor authentication" maxWidth="max-w-md">
        {setupStep === "password" && (
          <form onSubmit={startSetup} className="space-y-4">
            <p className="text-sm text-ink-soft">Confirm your password to start.</p>
            <input type="password" required autoFocus value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} placeholder="Current password" className={inputCls} />
            <Button type="submit" disabled={busy} className="w-full">{busy ? <><IcSpinner /> Continuing…</> : "Continue"}</Button>
          </form>
        )}
        {setupStep === "scan" && qrDataUrl && (
          <form onSubmit={confirmSetup} className="space-y-4">
            <p className="text-sm text-ink-soft">Scan this with your authenticator app (Google Authenticator, 1Password, Authy…), or enter the key manually.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="2FA QR code" className="mx-auto w-48 h-48 rounded-xl border border-card-border" />
            <div className="bg-surface border border-card-border rounded-xl px-4 py-2.5 text-center">
              <code className="text-xs font-mono text-ink break-all">{secret}</code>
            </div>
            <div>
              <label className={labelCls}>6-digit code</label>
              <input type="text" required autoFocus inputMode="numeric" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" className={`${inputCls} text-center text-lg tracking-[0.5em] font-mono`} />
            </div>
            <Button type="submit" disabled={busy || code.length !== 6} className="w-full">{busy ? <><IcSpinner /> Verifying…</> : "Verify & enable"}</Button>
          </form>
        )}
        {setupStep === "codes" && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-ink">Save your recovery codes</p>
            <p className="text-xs text-ink-soft">Each can be used once if you lose access to your authenticator. Store them somewhere safe — this is the only time they&apos;re shown.</p>
            <div className="bg-surface border border-card-border rounded-xl p-4 grid grid-cols-2 gap-2 font-mono text-xs text-ink">
              {recoveryCodes.map((c) => <span key={c}>{c}</span>)}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={copyRecoveryCodes}><IcCopy /> Copy all</Button>
              <Button size="sm" onClick={resetSetup}><IcCheck /> Done</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={disableOpen} onClose={() => setDisableOpen(false)} title="Disable two-factor authentication" maxWidth="max-w-sm">
        <form onSubmit={disable2fa} className="space-y-4">
          <p className="text-sm text-ink-soft">This removes the extra sign-in step. Confirm your password to continue.</p>
          <input type="password" required autoFocus value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} placeholder="Current password" className={inputCls} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDisableOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy} className="!bg-none !bg-red-600">{busy ? <><IcSpinner /> Disabling…</> : "Disable"}</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

export default function SecuritySettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-extrabold grad-text inline-block">Security</h1>
        <p className="text-sm text-ink-soft mt-1">Keep your account locked down.</p>
      </div>
      <EmailSection />
      <PasswordSection />
      <TwoFactorSection />
    </div>
  );
}
